var express = require('express'),
    program = require('commander'),
    fs = require('fs'),
    _ = require('underscore')._,
    winston = require('winston'),
    redis_lib = require('redis'),
    knox = require('knox'),
    exec = require('child_process').exec;


var logger= new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            filename:'server.log',
            timestamp:true,
            json:false,
            level: "debug"
            })
    ],
    levels: winston.config.syslog.levels
});

// load AWS credentials
var conf = JSON.parse(fs.readFileSync("conf.json"));

var s3 = knox.createClient(conf["aws"]);


var redis = redis_lib.createClient(conf["redis"]["port"],
    conf["redis"]["server"]);


program.version(0.1)
    .option('-p, --port [num]', "Set the port.")
    .parse(process.argv);
    
var host = "localhost";
if(program.args.length==1) {
    host = program.args[0];
} else if (program.args.length==0) {
    logger.info("Defaulting to localhost.");
} else {
    logger.info("Too many command line arguments.");
}

var port = process.env.PORT || 8080;

if(program.port) {
    logger.info("Setting port to " + program.port);
    port = program.port;
}

var app = express.createServer();

app.listen(port);
app.use(express.bodyParser());
app.use(express.errorHandler({ dumpExceptions: true }));
app.use("/static", express.static(__dirname + '/static'));
app.use(express.favicon(__dirname + '/static/img/favicon.ico', { maxAge: 2592000000 }));


// Setup the index page.
app.get('/', function(req, res) {
    res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
        "camera":false, "initialFocus":"none"}});
});

app.get('/browse/:name', function(req, res) {
    var emojiName = req.params.name;
    res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
        "camera":false, "initialFocus":"none"}});
});

app.get('/photo/:filename', function(req, res) {
    var filename = req.params.filename;
    
    // when we're loading photos directly, insert the FB meta tags that help
    // fb identify the right image to include as the thumbnail. 
    // see: http://stackoverflow.com/questions/1138460/how-does-facebook-sharer-select-images
    res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
        "camera":false, "initialFocus":filename,
    "fbMetaImageURL":"http://me-moji.s3.amazonaws.com/" + filename + ".png"}});
});

// render the same site for /camera/
app.get('/camera/:name', function(req, res) {
    var emojiName = req.params.name;
    
    res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
        "camera":true, "initialFocus":"none"}});
});


app.get('/photos/:id', function(req, res) {
    var emojiId = parseInt(req.params.id);
    
    // fetch it off redis
    redis.lrange("emoji:" + emojiId, 0, -1, function(err, filenames) {
        var fullUrls = _.map(filenames, function(filename)
            {return "http://me-moji.s3.amazonaws.com/" + filename;
        });
        
        res.send(JSON.stringify(fullUrls));
    });
});

app.post('/camera/', function(req, res) {
    var imgData = req.param("image");
    var emojiId = req.param("emojiId");
    var timestamp = Date.now();
    
    logger.info("Received camera post!");
    var filename = timestamp + "_" + emojiId + ".png";
    var buf = new Buffer(imgData.match(/,(.+)/)[1],'base64');
    
    // okay, first we're going to write this to a temp file and then
    // run it through identify to make sure it meets our basic criteria.
    fs.writeFile("/tmp/" + filename, buf, function(err) {
        
        // now run that file through identify.
        
        var child = exec('identify /tmp/' +filename,
          function (error, stdout, stderr) {
              // 1338505175637_6.png PNG 240x240 240x240+0+0 8-bit DirectClass 2.95KB 0.000u 0:00.000
              var resultPieces = stdout.split(" ");
              logger.debug("identify! " + stdout);
              if(resultPieces[1]=="PNG" && resultPieces[2]=="240x240" &&
                resultPieces[4]=="8-bit") {
                  // okay, now we're good and trust the image. Upload it
                  // to s3.
                  
                  var req = s3.put(filename, {
                      'Content-Length':buf.length,
                      'Content-Type':'image/png'
                  });
                  
                  req.on('response', function(res) {
                      if(200 == res.statusCode) {
                          
                          // do a bunch of redis work here.
                          // 1. increment the id counter
                          // 2. make an image:id entry
                          // 3. push onto the queue
                          redis.incr("global:nextImageId", function(err,
                              imageId) {
                              redis.hmset("image:" + imageId, {
                                  "filename":filename,
                                  "emojiId":emojiId,
                                  "timestamp":timestamp,
                                  "sessionId":-1}, function (err, res) {

                                      redis.lpush("emoji:" + emojiId,
                                        filename, function(err, res) {
                                              // limit the number of emoji in
                                              // that list to 50.
                                              redis.ltrim("emoji:" + emojiId,
                                                -50, -1,
                                                  function(err, res) {
                                                      logger.debug("\tid: "
                                                      +imageId+
                                      " url: http://me-moji.s3.amazonaws.com/"
                                                      + filename)
                                                  });
                                          });
                                  });

                          });
                      }
                  });
                  
                  req.end(buf);
                  res.end();
                  
                  
              } else {
                  logger.error("Uploaded image failed: " + stdout);
                  
                  // "UNSUPPORTED MEDIA TYPE"
                  res.send(415);
                  res.end();
              }
        });
    });
    
});

