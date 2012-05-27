$(document).ready(function() {
    console.log("Hello world!");
    
    
    $(".emoji").click(function() {
        $(".emoji").removeClass("select");
        $(this).addClass("select");
    });
    
});