
var photoboothShown = false;

$(document).ready(function() {
    console.log("Hello world!");
    
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
    
    $("#logo").click(function() {
        if(photoboothShown) {
            hidePhotobooth();
        }
    });
    
});


function showPhotobooth() {
    $("#photobooth").animate({height: "400px"}, 500, "linear");
    
    photoboothShown = true;
}

function hidePhotobooth() {
    $("#photobooth").animate({height: "0px"}, 500, "linear");
    
    photoboothShown = true;
}