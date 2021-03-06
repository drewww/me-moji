
var countdown = 2;

var canvas;
var pos = 0, ctx = null, image = [];
var rowCount = 0;

var photoboothShown = false;
var focusShown = false;
var webcamInitialized = false;
var aboutShown = false;

var sndBeep = null;
var sndShutter = null;

var curUrl;

// the initial none is because emoji id are 1 based right now
var emojiNames = ["none", "smile", "blush", "wink", "hearts", "kiss", "flushed",
    "relieved", "grin", "tongue", "unamused", "smirk", "pensive",
    "confounded", "crying", "tears", "astonished", "scream", "pout", "cat"];



$(document).ready(function() {
    // setup idle reloading if there's no cookie present, ie in kiosk
    // mode.
    if(document.cookie.length==0) {
      var time = new Date().getTime();
      $(document.body).bind("mousemove keypress", function(e) {
        time = new Date().getTime();
      });

      function refresh() {
        if(new Date().getTime() - time >= 60000*10) 
        window.location.reload(true);
        else 
        setTimeout(refresh, 30000);
      }

      setTimeout(refresh, 30000);
      
      // also on kiosk, disable the links in the about page so people can't
      // sneak out of the kiosk mode onto other websites.
      $("#about a").contents().unwrap();
    }
    
    curUrl = document.URL;
    
    $(".tt").tooltip({placement:"bottom"});
    
    repositionAutoMarginDiv("#container");
    repositionAutoMarginDiv("#camera-container");

    
    // check if we've got an emojiname from the server.
    var pickRandomName = true;
    if(emojiName!="none") {
        emojiId = emojiNames.indexOf(emojiName);
        if(emojiId!=-1) {
            pickRandomName = false;
        } // otherwise, cascade down below and randomize the id.
        
    } else if(initialFocus !="none") {
      
      if(focusType=="photo") {
        initialFocus += ".png";
        pickRandomName = false;
        emojiId = parseInt(initialFocus.slice(14, 16));
      } else if(focusType=="set") {
        initialFocus += ".png";
        pickRandomName = true;
      }
    } 
    
    if(pickRandomName) {
        emojiId = Math.floor(Math.random()*18)+1;
    }
    
    updateEmojiTabSelect();
    
    // updateEmojiPhotosForId(emojiId);
    
    $("#photobooth").hide();
    $("#background").hide();
    $("#emoji-example").hide();
    $("#mask").hide();
    $("#focus").hide();
    $("#about").hide();
    
    $(".spinner").hide();
    
    $("div.notice").hide();
    
    // on load, check the sessionPhotos list to see if this session has
    // photos we should load in.
    for(var emojiIdIndex in sessionPhotos) {
        var url = sessionPhotos[emojiIdIndex];
        
        if(url!=null) {
            addPhotoToSessionGutter(url, emojiIdIndex);
        }
    }
    
    
    if(jQuery.browser.mozilla) {
        sndBeep = new Audio("/static/sounds/beep.ogg");
        sndShutter = new Audio("/static/sounds/shutter.ogg");
    } else if(jQuery.browser.msie){
      if(jQuery.browser.version<8) {
        console.log("in IE < 8");
      } else {
        console.log("in IE > 8");
      }
    } else {
       sndBeep = new Audio("/static/sounds/beep.m4a");
       sndShutter = new Audio("/static/sounds/shutter.m4a");
    }
    
    $("#about-button").click(function(event) {
        showBackground();
        $("#about").show(500);
        aboutShown = true;
    });
    
    $(".close-button").click(closeButtonClick);
    
    $(".emoji").click(emojiTabClick);
    
    $("#add-photo").click(function() {
        console.log("Bring up camera.");
    });
    
    $("#add-photo").click(function() {
        showPhotobooth();
    });
    
    $("#logo, #background").click(dismissClick);
    
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
    } else if(initialFocus!="none"){
        showFocus("http://me-moji.s3.amazonaws.com/" + initialFocus, focusType);
    } else {
        updateURLForEmojiId(emojiId);
    }
	
});

function dismissClick(event) {
    if(photoboothShown) {
        hidePhotobooth();
    } else if(focusShown) {
        hideFocus();
    } else if(aboutShown) {
        hideBackground();
        $("#about").hide(500);
    }
}

function updateEmojiTabSelect() {
    $(".emoji").removeClass("select");
    $("#gutter img").each(function() {
        if($(this).attr("src").indexOf("/"+emojiId+".png")!=-1) {
            $(this).addClass("select");
        }
    });
    
    $("#emoji-example").attr("src", "/static/img/emoji/" + emojiId + ".png");
    
    updateEmojiPhotosForId(emojiId, photoboothShown);
}

function closeButtonClick(event) {
        if(photoboothShown) hidePhotobooth();
        else hideFocus();
}

function emojiTabClick(event) {
    
    var tab = this;
    
    if($(event.target).parent().attr("id")=="session-photos") {
        var id = parseInt($(this).attr("src").slice(18, 20))
        tab = $("#emoji" + id);
    }
    
    $(".emoji").removeClass("select");
    $(tab).addClass("select");
    
    // how does this work? it's not always 2 char
    // TODO update this so it's not so fragile. I think it's working because
    // parseInt("2.") resolved to 2, but that's a little funny.
    emojiId = parseInt($(tab).attr("src").slice(18, 20));
    
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
    
    // track the current URL in a separate field so when we share on tw/fb,
    // we share the right link.
    if(jQuery.browser.msie) {
      console.log("skipping msie pushstate");
      curUrl = document.URL + url;
    } else {
      history.pushState({}, "", url);
    }
}

function updateURLForFocus(filename, type) {
  var url = "/"+type+"/" + filename.split(".")[0];
  if(jQuery.browser.msie) {
    console.log("skipping msie pushstate");
    curUrl = document.URL + url;
  } else {
    history.pushState({}, "", url);
  }
}

function updateEmojiPhotosForId(newId) {
    $.ajax("/photos/" + newId, {
        dataType: "json",
        success: function(data, textStatus) {
            // make image objects for each of the items.
            
            $("#content .emoji-container").remove();
            $("#content ul li .clear").remove();
            $("ul li:empty").remove();
            
            // if(emptyLi) emptyLi.remove();
            
            // this gets a little tricky. we want to group every 5 pictures
            // into a single li. if that one is full, make a new one and
            // move to the next line. every other one will be formatted
            // differently. 
            var odd = false;
            $.each(data, function(index, url) {
                
                // figure out our container first. get the last child of
                // #all-photos and see how many children IT has.
                
                var container = $("#all-photos li:last-child");
                
                var maxRowLength = 5;
                if(odd) maxRowLength = 4;
                
                if(container.find(".emoji-container, #add-photo").length==maxRowLength) {
                    // make a new LI and append it and set that as the new
                    // container.
                    container = $("<li><br class='clear'></li>");
                    container.appendTo("#all-photos");
                    
                    odd = !odd;
                }
                
                // each element is an image and a mask.
                var newItem = $("<div class='emoji-container'>\
<img class='emoji-photo circle' src="+url+"></div>");
                
                if(container.hasClass("first")) {
                    newItem.appendTo(container);
                } else {
                    newItem.prependTo(container);
                }
                
                // now add a click listener to all of these
                newItem.click(function() {
                    showFocus($(this).children()[0].src, 'photo');
                });
            });
            
            // after doing this, get the last item and put a br on it.
            $("#all-photos li:last-child").append($("<br class='clear'>"));
            
        }
    });
}


// photo ids are the filenames on S3 - timestamp+emojiId
function showFocus(photoUrl, type) {
    showBackground();
    
    updateURLForFocus(photoUrl.split("/")[3], type);
    
    $("#focus").removeClass("photo");
    $("#focus").removeClass("set");
    
    $("#focus").addClass(type);
    
    
    
    // add in the like buttons for facebook and twitter to #focus-footer
    $("#focus-footer").empty();
    
    var urlToShare;
    
    if(jQuery.browser.msie) {
      urlToShare = curUrl;
    } else {
      urlToShare = document.URL;
    }
    
    // DISABLING FB/TW for now because they're a hassle and not really
    // blocking. Will come back to this for v1.1
    // var facebook = $('<div class="fb-like" data-send="false" data-layout="button_count" data-width="450" data-show-faces="false" data-href="'+urlToShare+'"></div>');
    
    // var twitter = $('<a href="https://twitter.com/share" class="twitter-share-button" data-url="'+urlToShare+'" data-text="Check out my cute me-moji face!" data-via="memoji" data-hashtags="memoji" data-dnt="true">Tweet</a>');
    
    // console.log("urlToShare: " + urlToShare);
    
    
    // setupFacebook(document, 'script', 'facebook-jssdk');
    // setupTwitter(document, "script", "twitter-wjs");
    
    
    // not totally sure why we add these after doing setup, but it seems to
    // work so we'll roll with it.
    // $("#focus-footer").append(twitter);
    // $("#focus-footer").append(facebook)
    
    // pull up a dialog box 
    $("#focus").show(500);
    
    if(type=='set') {
      // delay a bit until we're sure the photo is available.
      
      // hide this until we're sure it's loaded successfully
      $("#focus img.main").hide()
      
      $("#focus img.spinner").show();
      $("#focus div.notice").show();

      $("#focus img.main").error(function() {
        setTimeout(function() {
          $("#focus img.main").attr("src", photoUrl);
        }, 500);
      });
      
      $("#focus img.main").load(function() {
        $("#focus img.spinner").hide();
        $("#focus div.notice").hide();
        $("#focus img.main").show();
      });
    }
    // insert the right picture into the dialog box
    $("#focus img.main").attr("src", photoUrl);
    
    focusShown = true;
    
    // setTimeout(function() {
    //     FB.XFBML.parse(document.getElementById('focus-footer'));
    //     }, 100);
}

function hideFocus() {
    hideBackground();
    $("#focus").hide(500);
    focusShown = false;
    
    updateURLForEmojiId(emojiId);
}

function showBackground() {
    $("#background").show().animate({opacity: "0.5"}, 500, "linear", function() {
      // this is a stupid hack to deal with the situation when show is 
      // called within 500ms of hide.
      $(this).show();
    });
}

function hideBackground() {
    $("#background").animate({opacity: "0.0"}, 500, "linear", function() {
        $(this).hide();
    });
}

function initializeWebcam() {
    $("#video").webcam({
		width: 320,
		height: 240,
		mode: "callback",
		swffile: "/static/js/lib/jscam/jscam.swf",
		onTick: function() {
		    if(sndBeep!=null) {
    		    sndBeep.currentTime = 0;
            sndBeep.play();
		    }
		    
			highlight(countdown);
			countdown--;
		},
		
		// this method is called once for each row of image data.
		// the udpated .swf that flips the camera when in live view doesn't
		// flip the response, and it's double scaled: 640x480 when we really want
		// 320x240. So in this method we downscale by skipping every other row
		// and every other column. 
		onSave: function(data) {
		  
		  if(rowCount%2==0) {
		    rowCount++;
		    return;
		  }
		  
		  var col = data.split(";"),
      img = image;
      col.reverse();
      
      
			var img = image;
			
			// skip the first bunch of columns because we know they're outside
			// our target circle. Jump by 2s because we're downscaling from 640x480.
			for(var i = 80; i < 560; i=i+2) {
				
				var x = i;
				var y = rowCount;
				var alpha = 0xff;
        
        // check to see if we're within the circle. This filters the images
        
        var distance = Math.sqrt(Math.pow(x-320, 2)+Math.pow(y-240, 2));
        if(distance>240) {
            alpha = 0x00;
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
		  console.log("CAPTURE");
			jQuery("#flash").css("display", "block");
			jQuery("#flash").fadeOut("fast", function () {
				jQuery("#flash").css("opacity", 1);
			});
            
            if(sndShutter != null) {
    		    sndShutter.currentTime = 0;
                sndShutter.play();
            }
            
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
		  console.log("debug " + type + "; string");
      if ( string == 'camera-started' ){
          // at this point, turn on the images for overlay.
          $("#emoji-example").show().animate({opacity:1.0}, 250, function() {
            $("#emoji-example").tooltip('show');
            $(".tooltip.right").css("top","192px")
            $(".tooltip.right").css("width","100px")
          });
          
          $("#mask").show();
      } else if(string == 'no-camera-detected') {
        console.log("no camera");
        $("#no-camera-modal").modal();
        
        // also dismiss camera view and disable the camera button
        hidePhotobooth();
        
        // deregister the click method on the photo buttns?
      }
		},
		onLoad: function() {
      // this fires after the camera permissions have been accepted by
      // the user. Nothing particular to do at this point.
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
    showBackground();
    
    $("#photobooth").animate({height: "450px"}, 500, "linear", function() {
    });
    
    $("#gutter").css("position", "relative");
    $("#gutter").css("z-index", "11");
    
    photoboothShown = true;
    
    updateURLForEmojiId(emojiId, true);
}

function hidePhotobooth() {

    hideBackground();
    $("#photobooth").animate({height: "0px"}, 500, "linear", function() {
        $("#photobooth").hide();
    });

    $("#emoji-example").tooltip('hide');
    $("#emoji-example").hide();
    $("#mask").hide();
    

    $("#gutter").css("position", "static");
    
		
    
    photoboothShown = false;
    updateEmojiPhotosForId(emojiId);
    updateURLForEmojiId(emojiId, false);
}


function upload(image) {
    $.ajax({
      type: 'POST',
      url: "/camera/",
      dataType: "json",
      data: {"image":canvas.toDataURL("image/png"), "emojiId":emojiId},
      success: function(data, textStatus) {
        
          var numPhotosBeforeAddition = getNumPhotosInSession();
        
          var lastPhotoTimestamp = data["photoURL"].split("_")[2];
          var emojiForUploadedPhoto = parseInt(data["photoURL"].split("_")[3]);
        
          addPhotoToSessionGutter(data["photoURL"], emojiForUploadedPhoto);
          
          // if this was the last photo, switch to a set focus mode.
          if(getNumPhotosInSession()==19) {
            console.log("REPLACEMENT ON EXISTING SET");
            hidePhotobooth();

            // http://me-moji.s3.amazonaws.com/set_S1AN3xi4wruUvB27dPwQZw.png
            showFocus("http://me-moji.s3.amazonaws.com/set_" + sessionId + "_" +lastPhotoTimestamp+".png", 'set');
          }

      },
      error: function(data, textStatus) {
    		console.log("FAIL: " + data + "; " + textStatus);
      }
    });
}

function addPhotoToSessionGutter(url, emojiIdForUrl) {
    // this is a weird kiosk-mode exception. we don't want to accumulate
    // session photos if we're on a kiosk-mode instance of memoji.
    // shutting down cookies helps: then the server views every request
    // as being from a new session. the trick is, the client doesn't
    // realize that, and tries to maintain an accurate sessionPhotos
    // record. to get around that, we'll look at document.cookie and
    // if it's empty, assume we're in a no-cookie environment and we 
    // shouldn't update sessionPhotos. 
    // HOWEVER it's okay to put them in the gutter, because that looks
    // sort of cool. Just don't try to make a contact sheet out of it
    // at the end.
    
    console.log("emojiIdForUrl: " + emojiIdForUrl);
    if(document.cookie.length==0) {
      console.log("post on a no-cookie machine; ignore");
    } else {
      // keep that list up to date.
      sessionPhotos[emojiIdForUrl] = url;
    }
    
    var slotClass = "slot" + (emojiIdForUrl-1);
    
    // knock out any other photos in the same slot. 
    $("#session-photos .session-photo." + slotClass).remove();
    
    var newPhoto = $("<img class='session-photo' src='"+url+"'>");
    
    // now put the image in the right slot (we'll do animation later)
    newPhoto.addClass(slotClass);
    
    $("#session-photos").append(newPhoto);
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
			$(".close-button").show();
		    
			
			$("#camera").show();
			$("#countdown").hide();
			$("#review").hide();
			
			$("#logo, #background").click(dismissClick);
      
            
			break;
		case "COUNTDOWN":
			// show #video
			$("#image").hide();
			$("#image-background").hide();

			$("#camera").hide();
			$("#countdown").show();
			$("#review").hide();
			
			$(".close-button").hide();
            
		  $("#logo, #background").off("click");
		  $(".emoji").off("click");
            
			break;
		case "REVIEW":
	        // disable clicking on emoji in review mode.
	    $(".emoji").off("click");
	    $(".close-button").hide();
	    
	    $("#logo, #background").off("click");
		    
			$("#image").show();
			$("#image-background").show();

			$("#camera").hide();
			$("#countdown").hide();
			$("#review").show();
			break;
	}
}

function getNumPhotosInSession() {
  return _.filter(sessionPhotos, function(item) {return !_.isNull(item)}).length;
}

// PER http://stackoverflow.com/questions/3003724/cant-click-allow-button-in-flash-on-firefox

function repositionAutoMarginDiv(id) {
  // this routine is a complete hack to work around the flash "Allow" button bug
  if ( $(id).length > 0 ) {
    //Adjust the left-margin, since by default it likely isn't an int
    setLeftMargin(id);
    //If the User resizes the window, adjust the #content left-margin
    $(window).bind("resize", function() { setLeftMargin(id); });
  }
}

function setLeftMargin(id) {
  var newWindowWidth = $(id).parent().width();
  var mainWellWidth = $(id).width();
  // create an integer based left_offset number
  var left_offset = parseInt((newWindowWidth - mainWellWidth)/2.0);
  if (left_offset < 0) { left_offset = 0; }
  $(id).css("margin-left", left_offset);
}


function setupFacebook(d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) return;
  js = d.createElement(s); js.id = id;
  js.src = "//connect.facebook.net/en_US/all.js#xfbml=1";
  fjs.parentNode.insertBefore(js, fjs);
}


// Hacked up tweet button code
function setupTwitter(d, s, id){

// THIS HACK IS DISGUSTING. The problem is that we want to re-format tweet
// buttons each time we show a new picture. Unfortunately, something triggers
// when the widget.js script is added that does the search. I can't figure
// out where to plug into that script to just call that method each time
// I want to show a new twitter button. So instead I just manually remove the
// special script tag each time and force a re-run. This is probably heinously
// slow but I haven't figured out an alternative method yet.

$(".twitter-share-button").remove();
// $("#" + id).remove();


var js,fjs=d.getElementsByTagName(s)[0];

if(!d.getElementById(id)){
	js=d.createElement(s);
	js.id=id;
	js.src="//platform.twitter.com/widgets.js";
	fjs.parentNode.insertBefore(js,fjs);
	}
}