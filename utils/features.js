/**
 * @file feature detects
 * @author oott123
 */

define(function () {
    function detectCSS(text) {
        var el = document.createElement('div');
        el.style.cssText = text;
        return !!el.style.length;
    }
    function detectCSSCalc() {
        return detectCSS('width: calc(100px)');
    }
    function detectCSSViewportUnits() {
        return detectCSS('width: 100vw');
    }

    return {
        detectCSS: detectCSS,
        detectCSSCalc: detectCSSCalc,
        detectCSSViewportUnits: detectCSSViewportUnits
    };
});
