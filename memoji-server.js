var express = require('express'),
    program = require('commander'),
    fs = require('fs'),
    _ = require('underscore')._,
    winston = require('winston'),
    redis_lib = require('redis'),
    knox = require('knox');

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
    res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
        "camera":false, "initialFocus":filename}});
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
            redis.incr("global:nextImageId", function(err, imageId) {
                redis.hmset("image:" + imageId, {
                    "filename":filename,
                    "emojiId":emojiId,
                    "timestamp":timestamp,
                    "sessionId":-1}, function (err, res) {
                        
                        redis.lpush("emoji:" + emojiId, filename,
                            function(err, res) {
                                // limit the number of emoji in that list to 50.
                                redis.ltrim("emoji:" + emojiId, -50, -1,
                                    function(err, res) {
                                        logger.debug("\tid: "+imageId+" url: http://me-moji.s3.amazonaws.com/" + filename)
                                    });
                            });
                    });
                    
            });
        }
    });
    
    req.end(buf);
    res.end();
});

