$(document).ready(function() {
    console.log("Hello world!");
    
    $(".emoji").click(function() {
        $(".emoji").removeClass("select");
        $(this).addClass("select");
    });
    
    $("#add-photo").click(function() {
        console.log("Bring up camera.");
    });
    
});