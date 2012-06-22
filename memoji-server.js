var express = require('express'),
    program = require('commander'),
    fs = require('fs'),
    _ = require('underscore')._,
    winston = require('winston'),
    redis_lib = require('redis'),
    knox = require('knox'),
    RedisStore = require('connect-redis')(express),
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

// we could reuse the existing connection, but that would put session vars
// in the same namespace as everything else. Seems cleaner to put them
// in a different database index.
var redisSessionStore = new RedisStore({"host":conf["redis"]["server"],
    "port":conf["redis"]["port"], "db":1});


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

app.use(express.cookieParser());
app.use(express.session({secret:conf["session-secret"],
    store:redisSessionStore}));

app.use(express.bodyParser());
app.use(express.errorHandler({ dumpExceptions: true }));
app.use("/static", express.static(__dirname + '/static'));


// Setup the index page.
app.get('/', function(req, res) {
    sessionInit(req);
    
    res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
        "camera":false, "initialFocus":"none", "photos":JSON.stringify(req.session.photos)}});
});

app.get('/browse/:name', function(req, res) {
    sessionInit(req);

    var emojiName = req.params.name;
    res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
        "camera":false, "initialFocus":"none", "photos":JSON.stringify(req.session.photos)}});
});

app.get('/photo/:filename', function(req, res) {
    sessionInit(req);

    var filename = req.params.filename;
    res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
        "camera":false, "initialFocus":filename, "photos":JSON.stringify(req.session.photos)}});
});

// render the same site for /camera/
app.get('/camera/:name', function(req, res) {
    sessionInit(req);

    var emojiName = req.params.name;
    
    res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
        "camera":true, "initialFocus":"none", "photos":JSON.stringify(req.session.photos)}});
});


app.get('/photos/:id', function(req, res) {
    sessionInit(req);

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
                  
                  var s3req = s3.put(filename, {
                      'Content-Length':buf.length,
                      'Content-Type':'image/png'
                  });
                  
                  s3req.on('response', function(s3res) {
                      if(200 == s3res.statusCode) {
                          
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
                                  "sessionId":req.session.id},
                                  function (err, res) {
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
                          
                          // put this photo in the session so it's tracked per person.

                          if(!(req.session.photos)) {
                              req.session.photos = [];
                          }

                          var fullPath = "http://me-moji.s3.amazonaws.com/" + filename;

                          req.session.photos[emojiId] = fullPath;

                          console.log("photos: " + JSON.stringify(req.session.photos));

                          res.write('{"photoURL":"'+fullPath+'"}');
                          res.end();
                          
                      }
                  });
                  
                  s3req.end(buf);
              } else {
                  logger.error("Uploaded image failed: " + stdout);
                  
                  // "UNSUPPORTED MEDIA TYPE"
                  res.send(415);
                  res.end();
              }
        });
    });
    
});

function sessionInit(req) {
    if(typeof req.session.photos == "undefined") {
        req.session.photos = [];
    }
}
