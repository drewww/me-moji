var express = require('express'),
    program = require('commander'),
    fs = require('fs'),
    _ = require('underscore')._,
    winston = require('winston');

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


// Load up all the files on disk into memory.

var sortedImagesByEmojiId = [];

function loadExistingImages() {
    // scream through all the files and save
    // their full urls.
    logger.info("Loading files...");
    
    fs.readdir("static/img/photos/", function(err, files) {
        for(fileIndex in files) {
            var file = files[fileIndex];
            
            if(file[0]==".") continue;
            if(file=="README") continue;
            
            var parts = file.split("_");
            
            var time = parts[0];
            var emojiId = parseInt(parts[1].split(".")[0]);
            
            logger.debug("time: " + time + "; id: "+ emojiId);
            
            var list = [];
            if(emojiId in sortedImagesByEmojiId) {
                list = sortedImagesByEmojiId[emojiId];
            }
            
            list.push(file);
            sortedImagesByEmojiId[emojiId] = list;
        }
    });
}

loadExistingImages();

var app = express.createServer();

app.listen(port);
app.use(express.bodyParser());
app.use("/static", express.static(__dirname + '/static'));

// Setup the index page.
app.get('/', function(req, res) {
    res.render('index.ejs', {layout:false});
});

app.get('/camera/', function(req, res) {
    res.render('camera.ejs', {layout:false,
        locals:{"emojiId":Math.floor(Math.random()*21)}
    });
});

app.post('/camera/', function(req, res) {
    var imgData = req.param("image");
    var emojiId = req.param("emojiId");
    
    logger.info("Received camera post!");
    var filename = Date.now() + "_" + emojiId + ".png";
    fs.writeFile("static/img/photos/" + filename,
    new Buffer(imgData.match(/,(.+)/)[1],'base64'),
    function(err) {
        if(err==null) {
            var list = [];
            if(emojiId in sortedImagesByEmojiId) {
                list = sortedImagesByEmojiId[emojiId];
            }
            
            list.push(filename);
            
            logger.debug("current emoji list: " + JSON.stringify(sortedImagesByEmojiId));
        }
    });
});

