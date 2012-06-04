
var countdown = 2;

var canvas;
var pos = 0, ctx = null, image = [];
var rowCount = 0;

var photoboothShown = false;
var webcamInitialized = false;

// the initial none is because emoji id are 1 based right now
var emojiNames = ["none", "smile", "blush", "wink", "hearts", "kiss", "flushed",
    "relieved", "grin", "tongue", "unamused", "smirk", "pensive",
    "confounded", "crying", "tears", "astonished", "scream", "pout", "cat"];

$(document).ready(function() {
    
    // check if we've got an emojiname from the server.
    var pickRandomName = true;
    if(emojiName!="none") {
        
        emojiId = emojiNames.indexOf(emojiName);
        if(emojiId!=-1) {
            pickRandomName = false;
        } // otherwise, cascade down below and randomize the id.
        
    }
    
    if(pickRandomName) {
        emojiId = Math.floor(Math.random()*18)+1;
    }
    
    updateEmojiTabSelect();
    updateEmojiPhotosForId(emojiId);
    updateURLForEmojiId(emojiId);
    
    $("#photobooth").hide();
    $("#background").hide();
    $("#emoji-example").hide();
    $("#mask").hide();

    
    $(".emoji").click(emojiTabClick);
    
    $("#add-photo").click(function() {
        console.log("Bring up camera.");
    });
    
    $("#add-photo").click(function() {
        showPhotobooth();
    });
    
    $("#logo, #background").click(function() {
        if(photoboothShown) {
            hidePhotobooth();
        }
    });
    
    // From here down is all camera setup junk, mostly copied from camera.ejs.
    $("#select").click(function(event) {
		upload(image);
		setMode("CAMERA");
		
        $(".emoji").click(emojiTabClick);
        
        emojiId = (emojiId+1);
        
        if(emojiId==20) emojiId=1;
        
        updateEmojiTabSelect();
        updateEmojiPhotosForId(emojiId);
        event.stopPropagation();
	});
	
	$("#reject").click(function(event) {
		setMode("CAMERA");
		
        $(".emoji").click(emojiTabClick);
        event.stopPropagation();
	});
	
	$("#capture").click(function(event) {
		// show the countdown spans
		setMode("COUNTDOWN");
		window.webcam.capture(2);
		highlight(3);
		countdown = 2;
		
		event.stopPropagation();
	});
	
	
	if(initialCamera) {
        showPhotobooth();
    }
});

function updateEmojiTabSelect() {
    $(".emoji").removeClass("select");
    $("#gutter").children().each(function() {
        if($(this).attr("src").indexOf("/"+emojiId+".png")!=-1) {
            $(this).addClass("select");
        }
    });
    
    $("#emoji-example").attr("src", "/static/img/emoji/" + emojiId + ".png");
    
    updateEmojiPhotosForId(emojiId, photoboothShown);
}

function emojiTabClick(event) {
    $(".emoji").removeClass("select");
    $(this).addClass("select");
    
    emojiId = parseInt($(this).attr("src").slice(18, 20));
    
    $("#emoji-example").attr("src", "/static/img/emoji/" + emojiId + ".png");
    
    // we're going to do push state on the browser so we can keep the URL
    // up to date so if people C&P the URL it will actually go to the same
    // page.
    
    updateEmojiPhotosForId(emojiId);
    updateURLForEmojiId(emojiId, photoboothShown);
    
    event.stopPropagation();
}

function updateURLForEmojiId(emojiId, camera) {
    
    var url = "/browse/";
    if(camera) url = "/camera/";
    
    url = url + emojiNames[emojiId];
    
    history.pushState({}, "", url);
}

function updateEmojiPhotosForId(newId) {
    $.ajax("/photos/" + newId, {
        dataType: "json",
        success: function(data, textStatus) {
            // make image objects for each of the items.
            $(".emoji-photo").remove();
            $.each(data, function(index, url) {
                $("<img class='emoji-photo circle'>")
                    .attr("src", url)
                    .appendTo($("#content"));
            });
        }
    });
}

function initializeWebcam() {
    $("#video").webcam({
		width: 320,
		height: 240,
		mode: "callback",
		swffile: "/static/js/lib/jscam/jscam.swf",
		onTick: function() {
			console.log("tick!");
			highlight(countdown);
			countdown--;
		},
		onSave: function(data) {
			var col = data.split(";");
			var img = image;
			for(var i = 40; i < 280; i++) {
				// first check and see if we're within the circle.
				// if we aren't, set it to white + full alpha
				
				var x = i;
				var y = rowCount;
				var alpha = 0xff;
				var distance = Math.sqrt(Math.pow(x-160, 2)+Math.pow(y-120, 2));
				if(distance>120.5) {
					alpha = 0x00;
				} else if(distance>119.5) {
					alpha = 0x80;
				}
				
				var tmp = parseInt(col[i]);
				img.data[pos + 0] = (tmp >> 16) & 0xff;
				img.data[pos + 1] = (tmp >> 8) & 0xff;
				img.data[pos + 2] = tmp & 0xff;
				img.data[pos + 3] = alpha;
				pos+= 4;
			}

			if (pos >= 4 * 240 * 240) {
				ctx.putImageData(img, 0, 0);
				pos = 0;
				
				// be done!
				return;
			}
			
			rowCount++;
		},
		onCapture: function() {
			jQuery("#flash").css("display", "block");
			jQuery("#flash").fadeOut("fast", function () {
				jQuery("#flash").css("opacity", 1);
			});
			console.log("IN ON CAPTURE");
			canvas = document.getElementById("image");
			canvas.setAttribute('width', 240);
			canvas.setAttribute('height', 240);
			ctx = canvas.getContext("2d");
			image = ctx.getImageData(0, 0, 240, 240);
			rowCount = 0;
			
			setMode("REVIEW");
			webcam.save();
		},
		debug: function(type, string) {
            if ( string == 'Camera started' ){
                // at this point, turn on the images for overlay.
                $("#emoji-example").show().animate({opacity:1.0}, 250);
                $("#mask").show();
            }
		},
		onLoad: function() {
			console.log("load");
		}
	});
	
	webcamInitialized = true;
}

function showPhotobooth() {
        
    if(!webcamInitialized) {
        initializeWebcam(); 
    }
    
    setMode("CAMERA");
    
    $("#photobooth").show();
    $("#background").show().animate({opacity: "0.5"}, 500, "linear");
    
    $("#photobooth").animate({height: "400px"}, 500, "linear", function() {
    });
    
    $("#gutter").css("position", "relative");
    $("#gutter").css("z-index", "11");

    
    photoboothShown = true;
    
    updateURLForEmojiId(emojiId, true);
}

function hidePhotobooth() {
    
    $("#background").animate({opacity: "0.0"}, 500, "linear", function() {
        $(this).hide();
    });
    $("#photobooth").animate({height: "0px"}, 500, "linear", function() {
        $("#photobooth").hide();
    });
    
    $("#emoji-example").hide();
    $("#mask").hide();
    

    $("#gutter").css("position", "static");
    
    photoboothShown = false;
    updateEmojiPhotosForId(emojiId);
    updateURLForEmojiId(emojiId, false);
}


function upload(image) {
    console.log("uploading to emojiId: " + emojiId);
    
    $.ajax({
      type: 'POST',
      url: "/camera/",
      data: {"image":canvas.toDataURL("image/png"), "emojiId":emojiId},
      success: function(data, textStatus) {
  		console.log("server response: " + data + "; " + textStatus);
      },
      error: function(data, textStatus) {
    		console.log("FAIL: " + data + "; " + textStatus);
      }
    });
}

function highlight(num) {

    $("#countdown img").each(function() {
        $(this).attr("src","/static/img/" + $(this).attr("id")[5] + "white.png");
    });
    
    $("#count" + num).attr("src", "/static/img/" + num + "yellow.png");
}

function setMode(mode) {
	console.log("SETTING MODE: "  + mode);
	switch(mode) {
		case "CAMERA":
			// show #video
			$("#image").hide();
			$("#image-background").hide();
			
			
			$("#camera").show();
			$("#countdown").hide();
			$("#review").hide();
			break;
		case "COUNTDOWN":
			// show #video
			$("#image").hide();
			$("#image-background").hide();

			$("#camera").hide();
			$("#countdown").show();
			$("#review").hide();
			break;
		case "REVIEW":
	        // disable clicking on emoji in review mode.
		    $(".emoji").off("click");
		    
			$("#image").show();
			$("#image-background").show();

			$("#camera").hide();
			$("#countdown").hide();
			$("#review").show();
			break;
	}
}
