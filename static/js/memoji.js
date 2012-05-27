
var photoboothShown = false;

$(document).ready(function() {
    console.log("Hello world!");
    
    $("#photobooth").hide();
    $("#background").hide();
    
    
    $(".emoji").click(function() {
        $(".emoji").removeClass("select");
        $(this).addClass("select");
    });
    
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
    
});


function showPhotobooth() {
    $("#photobooth").show();
    $("#background").show().animate({opacity: "0.5"}, 500, "linear");

    $("#photobooth").animate({height: "400px"}, 500, "linear", function() {
        // ?
    });
    
    photoboothShown = true;
}

function hidePhotobooth() {
    $("#background").animate({opacity: "0.0"}, 500, "linear", function() {
        $(this).hide();
    });
    $("#photobooth").animate({height: "0px"}, 500, "linear", function() {
        $("#photobooth").hide();
    });
    
    photoboothShown = true;
}