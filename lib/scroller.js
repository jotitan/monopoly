/*
	jQuery Version:				jQuery 1.3.2
	Plugin Name:				ClickScroller V 1.0
	Plugin by: 					Jeff Waterfall: http://www.threeformed.com
	License:					ClickScroller is licensed under a Creative Commons Attribution 3.0 Unported License
								Read more about this license at --> http://creativecommons.org/licenses/by/3.0/			
*/
(function($) {
    $.fn.clickScroll = function(options) {
    	// setup default settings
    	var defaults = {
    		speed: 				200,
			easing: 			'linear',
			lessBtn:			'#clickscroll-less',
			moreBtn:			'#clickscroll-more',
			btnFadeSpeed:		100,
			horizontal:			false
    	},
    	settings = $.extend({}, defaults, options);
		
		return this.each(function() {
			var obj = $(this);
			// Variables
			var frameHeight = 	obj.innerHeight();
			var listHeight = 	obj.children('div').innerHeight();
			if(settings.horizontal) { // Get the width and apply it
				var listWidth = 0;
				obj.children('ul').children('li').each(function(i) {
					listWidth += $(this).outerWidth(true);
				});
				obj.children('ul').width(listWidth);
			}
			var itemCount = 	obj.children('div').children('div').size();
			var itemHeight = 	listHeight / itemCount;
			var steps = 		listHeight / itemHeight;
			var groupHeight = 	Math.ceil(listHeight / steps);
			var groupWidth = 	Math.ceil(listWidth / steps);
			var step = 			0;
			var targ =			0;
			
			$(settings.lessBtn).hide();
			if(listHeight > frameHeight) {
				obj.show();
			} else {
				$(settings.moreBtn).hide();
			}
			$(settings.moreBtn).click(function() {
				step++;
				if(settings.horizontal) {
					targ -= groupWidth;
					obj.children('div').stop(true).animate({'left':targ}, settings.speed, settings.easing);
				} else {
					targ -= groupHeight;
					obj.children('div').stop(true).animate({'top':targ}, settings.speed, settings.easing);
				}
				$(settings.lessBtn).fadeIn(settings.btnFadeSpeed);
				if(step >= Math.floor(steps)-1) {
					$(this).fadeOut(settings.btnFadeSpeed);	
				}
				return false;
			});
			$(settings.lessBtn).click(function() {
				step--;
				if(settings.horizontal) {
					targ += groupWidth;
					obj.children('div').stop(true).animate({'left':targ}, settings.speed, settings.easing);
				} else {
					targ += groupHeight;
					obj.children('div').stop(true).animate({'top':targ}, settings.speed, settings.easing);
				}
				$(settings.moreBtn).fadeIn(settings.btnFadeSpeed);
				if(step == 0) {
					$(this).fadeOut(settings.btnFadeSpeed);	
				}
				return false;
			});
	
		}); // END: return this
		
		// returns the jQuery object to allow for chainability.  
        return this;
    };
})(jQuery);