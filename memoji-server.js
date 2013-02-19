var express = require('express'),
    program = require('commander'),
    fs = require('fs'),
    _ = require('underscore')._,
    winston = require('winston'),
    // redis_iris_lib = require('iris-redis'),
    redis_lib = require('iris-redis'),
    knox = require('knox'),
    RedisStore = require('connect-redis')(express),
    http = require('http'),
    request = require('request'),

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

// load relevant environment varibles into a config object for easy use
// throughout the system. 
var conf = {"redis":{
  "host":process.env.REDIS_SERVER,
  "port":parseInt(process.env.REDIS_PORT),
  "auth":process.env.REDIS_AUTH,
  "iris":process.env.REDIS_IRIS!="false"
  },
  
  "aws":{
    "key":process.env.AWS_KEY,
    "secret":process.env.AWS_SECRET,
    "bucket":process.env.AWS_BUCKET
  },
  "session-secret":process.env.MEMOJI_SESSION_SECRET,
  "delete-pass":process.env.DELETE_PASSWORD
  };
  
logger.debug("CONFIG: " + JSON.stringify(conf));

var s3 = knox.createClient(conf["aws"]);

var redis;

logger.info("REDIS host: " + conf.redis.host + ":" + conf.redis.port + " (auth: " + conf.redis.auth +")");

if(conf.redis.iris) {
  redis = redis_lib.createClient(conf.redis.port, conf.redis.host, {auth:conf.redis.auth});
} else {
  redis = redis_lib.createClient(conf.redis.port, conf.redis.host, {auth:"null"});
}


program.version(0.1)
    .option('-p, --port [num]', "Set the port.")
    .parse(process.argv);
    
var host = "localhost";
if(program.args.length==1) {
    host = program.args[0];
} else if (program.args.length==0) {
    logger.info("Defaulting to localhost for webserver host.");
} else {
    logger.info("Too many command line arguments.");
}

var port = process.env.PORT || 8080;

if(program.port) {
    logger.info("Setting port to " + program.port);
    port = program.port;
}

var started = false;


redis.on("ready", function() {
  if(!started) setupServer();
})

function setupServer() {
  
  var app = express();

  app.configure(function() {

    var redisSessionStore = new RedisStore({client:redis});

    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.errorHandler({ dumpExceptions: true }));
    app.use("/static", express.static(__dirname + '/static'));
    app.use(express.favicon(__dirname + '/static/img/favicon.ico', { maxAge: 2592000000 }));
    app.use(express.session({secret:conf["session-secret"],
          store:redisSessionStore, cookie:{maxAge: 1000*60*60*24*365}}));
    logger.info("CONFIGURED SERVER");
  });


  // Setup the index page.
  app.get('/', function(req, res) {
      sessionInit(req);

      res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
          "camera":false, "initialFocus":"none",  "focusType":"none",
          "sessionId":sanitizeSessionId(req.session.id),
          "setUrl":req.session.setUrl,
          "photos":JSON.stringify(req.session.photos)}});
  });
  
  app.get("/delete", function(req, res) {
    res.render('delete.ejs');
  });
  
  app.post('/delete', function(req, res) {
      if(req.param("password")!=conf["delete-pass"]) {
        logger.warning("Attempt to delete with wrong pass: " + req.param("password"));
        res.send(405, "Bad Password"); // UNAUTHORIZED
        res.end();
        return;
      }
      
      // has the form m_On9qH6OdzyMwpNdBPDVII0e_1359678145694_4
      var filename = req.param("filename");
      
      var emojiId = parseInt(filename.split("_")[3]);
      
      filename = filename + ".png";
      
      redis.lrem("emoji:" + emojiId, 1, filename, function(err, result) {
        if(err) {
          logger.warning("error deleting " + filename + ": " + err);
          res.send(500, "Internal Server Error");
        } else {
          logger.info("Deleted picture: " + filename + "; result: " + result);
          res.send(200, "Worked!");
        }
      });
  });

  app.get('/browse/:name', function(req, res) {
      sessionInit(req);

      var emojiName = req.params.name;
      res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
          "camera":false, "initialFocus":"none", "focusType":"none", 
          "sessionId":sanitizeSessionId(req.session.id),
          "setUrl":req.session.setUrl,
          "photos":JSON.stringify(req.session.photos)}});
  });

  app.get('/photo/:filename', function(req, res) {
      sessionInit(req);

      var filename = req.params.filename;

      // when we're loading photos directly, insert the FB meta tags that help
      // fb identify the right image to include as the thumbnail. 
      // see: http://stackoverflow.com/questions/1138460/how-does-facebook-sharer-select-images
      res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
          "camera":false, "initialFocus":filename, "focusType":"photo",
          "photos":JSON.stringify(req.session.photos),
          "sessionId":sanitizeSessionId(req.session.id),
          "setUrl":req.session.setUrl,
          "fbMetaImageURL":"http://me-moji.s3.amazonaws.com/"+filename+".png"}
      });
  });


  app.get('/set/:session', function(req, res) {
      sessionInit(req);

      var filename = req.params.session;


      res.render('index.ejs', {layout:false, locals:{"emojiName":"none",
          "camera":false, "initialFocus":filename, "focusType":"set",
          "photos":JSON.stringify(req.session.photos),
          "sessionId":sanitizeSessionId(req.session.id),
          "setUrl":req.session.setUrl,
          "fbMetaImageURL":"http://me-moji.s3.amazonaws.com/"+filename + ".png"}
      });
  });


  // render the same site for /camera/
  app.get('/camera/:name', function(req, res) {
      sessionInit(req);

      var emojiName = req.params.name;

      res.render('index.ejs', {layout:false, locals:{"emojiName":emojiName,
          "camera":true, "initialFocus":"none",  "focusType":"none",
          "sessionId":sanitizeSessionId(req.session.id),
          "setUrl":req.session.setUrl,
          "photos":JSON.stringify(req.session.photos)}});
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

      logger.debug("Received camera post!");

      // session ids apparently can have '/' characters in them? annoying.
      // not sure what other evils they might hold.
      var safeId = sanitizeSessionId(req.session.id);

      var filename = safeId + "_" + timestamp + "_" + emojiId + ".png";
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
                    // now that we trust the image, lets mask it so that it's
                    // anti-aliased properly. 

                    var baseFilename = filename;
                    filename = "m_" + baseFilename;
                    var alias = exec('composite -compose CopyOpacity static/img/mask.png /tmp/' + baseFilename + ' -', {encoding:'binary', maxBuffer: 1000*1024},
                    function(error, stdout, stderr) {
                        console.log("composite stdout result length: " + stdout.length);
                        var progress = s3.putBuffer(new Buffer(stdout,'binary'),
                         filename, {
                            'Content-Length':stdout.length,
                            'Content-Type':'image/png',
                            'x-amz-acl': 'public-read'
                        }, function(err, s3res) {
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
                                        "sessionId":
                                            sanitizeSessionId(req.session.id)},
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

                                // check if all the emojiId have a path.
                                // we can't just look at lenght because if
                                // you have just the last emojiId, it inserts
                                // nulls in the rest because emojiId is an int
                                // not a string. 
                                var listWithEntries = _.filter(
                                  req.session.photos, function(item) {
                                    return !_.isNull(item);
                                  });

                                if(listWithEntries.length >= 19 ) {
                                  generateContactSheet(listWithEntries, timestamp, req);
                                }
                                res.write('{"photoURL":"'+fullPath+'"}');
                                res.end();
                            } // closes if statusCode==200
                        });
                    });
                } else {
                    logger.error("Image rejected: " + stdout);

                    // "UNSUPPORTED MEDIA TYPE"
                    res.send(415);
                    res.end();
                }
          });
      });

  });

  app.listen(port);
  started = true;
}


function sessionInit(req) {
    // logger.info("req.session: " + JSON.stringify(req.session));
    
    logger.info("session photos: " + _.filter(req.session.photos, function(photo) { return !_.isNull(photo)}).length);
    
    req.session.cookie.expires = false;
    req.session.cookie.maxAge = 365 * 24 * 60 * 60 * 1000;

    if(typeof req.session.photos == "undefined") {
        req.session.photos = [];
    } else if(typeof req.session.setUrl == "undefined") {
      logger.info("setting setUrl to ''");
      req.session.setUrl = "";
    }

}

function generateContactSheet(photoUrls, timestamp, req) {
  logger.info("GENERATING CONTACT SHEET: " + JSON.stringify(photoUrls) + " for timestamp " + timestamp);

  // 1. Download all the photos locally. They may have been taken on any
  //    server instance at any time so we need to make sure we have copies.
  //    We can optimize a little by checking to see if the file names are
  //    on our path already.


  var numDownloaded = 0;
  var numComposited = 0;

  var compositedPaths = [];

  var checkFinishedDownload = function() {
    numDownloaded++;
    if(numDownloaded==photoUrls.length) {

      // do the actual IM compositing here.

      // compositing is just another IM command. 
      // in all its usual torturous glory:
      // montage [images] -mode concatenate -tile 5x4 -geometry 240x240+10+10 out.png

      // this is a little cross to side-effect out of the map, but...
      var sessionId;

      var photoPaths = _.map(photoUrls, function(photoUrl) {
        var pieces = photoUrl.split("/");
        var filename = pieces[pieces.length-1];
        sessionId = sanitizeSessionId(filename.split("_")[1]);

        return "/tmp/" + filename;
      });

      // for each of these photos, add the emoji icon in the bottom-right
      // corner. 

      _.each(photoPaths, function(path) {
        var pieces = path.split("/");

        var emojiId = parseInt(path.split("_")[3].split(".")[0]);

        var emojiPath = "static/img/emoji/" + emojiId + ".png";

        var outputPath = "/tmp/o_" + pieces[pieces.length-1];

        compositedPaths.push(outputPath);

        var child = exec('convert ' + path + " " + emojiPath + " -geometry x100+163+163 -composite " + outputPath, function(err, stdout, stderr) {
          checkFinishedComposite();
        });
      });
    }
  }

  var checkFinishedComposite = function() {
    numComposited++;

    // drop out if they haven't all been composited yet
    if(numComposited!=photoUrls.length) return;

    var pieces = compositedPaths[0].split("/");

    var sessionId = sanitizeSessionId(pieces[pieces.length-1].split("_")[2]);
    compositedPaths.push("static/img/logomedium.png");

    var child = exec('montage ' + compositedPaths.join(" ") + " -mode concatenate -tile 5x4 -geometry 240x240+10+10 -", {encoding: 'binary', maxBuffer:5000*1024},
      function(err, stdout, stderr) {

        var progress = s3.putBuffer(new Buffer(stdout, 'binary'), "set_" + sessionId + "_"+timestamp+".png", {
          'Content-Length':stdout.length,
          'Content-Type':'image/png',
          'x-amz-acl': 'public-read'
        }, function(err, s3res) {
          if(200 == s3res.statusCode) {
            var url = "http://me-moji.s3.amazonaws.com/set_" +
              sessionId + "_" + timestamp + ".png";

            req.session["setUrl"] = url;
            req.session.save();
          }
        });
    });
  }

  _.each(photoUrls, function(photoUrl) {
    var pieces = photoUrl.split("/");

    var filename = pieces[pieces.length-1];

    fs.stat("/tmp/" + filename, function(err, stats) {
      if(!_.isNull(stats) && !_.isUndefined(stats)) {
        logger.debug("Found existing file: " + filename);
        checkFinishedDownload();
      } else {
        // download the file.
        logger.debug("Missing: " + filename);

        var r = request(photoUrl)
          .pipe(fs.createWriteStream("/tmp/"+filename));

        r.on("close", function() {
          logger.debug("Downloaded: " + filename);
          checkFinishedDownload();
        });
      }
    });
  });
}


function sanitizeSessionId(sessionId) { 
  return sessionId.replace("/", "").replace("+", "").replace("_", ""); 
}

var error = function(err) {
    if(err) {
      logger.warning(err.stack);
      process.exit(1);
    } else {
      process.exit(0);
    }
}

process.on('SIGTERM', error);
process.on('SIGINT', error);
process.on('uncaughtException', error);
