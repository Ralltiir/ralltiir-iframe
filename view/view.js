/**
 * @file    view 一个 Ralltiir 页面的视图对象，可被缓存
 * @author  harttle<harttle@harttle.com>
 */

define(function (require) {
    var animation = require('../utils/animation');
    var handleMessages = require('./handleMessages');
    var ua = require('../utils/ua');
    var features = require('../utils/features');
    var URL = require('../utils/url');
    var Loading = require('./loading');
    var dom = require('../utils/dom');
    var rt = require('ralltiir');
    var _ = require('@searchfe/underscore');
    var Promise = require('@searchfe/promise');
    var assert = require('@searchfe/assert');
    var Render = require('./render');
    var logger = rt.logger;
    var http = rt.http;
    var action = rt.action;
    var html = [
        '<div class="rt-view active">',
        '  <div class="rt-head">',
        '    <div class="rt-back"></div>',
        '    <div class="rt-actions"></div>',
        '    <div class="rt-center">',
        '      <span class="rt-title"></span>',
        '      <span class="rt-subtitle"></span>',
        '    </div>',
        '  </div>',
        '  <div class="rt-body"></div>',
        '</div>'
    ].join('');

    var iframeShell = require('iframe-shell');
    var Loader = iframeShell.loader;

    var supportCalcHeight = features.detectCSSCalc() && features.detectCSSViewportUnits();

    prepareEnvironment();

    // eslint-disable-next-line
    function View(scope, viewEl) {
        this.renderer = new Render();
        this.options = normalize(scope.options);
        this.performance = scope.performance;
        this.valid = true;

        if (viewEl) {
            this.initElement(viewEl);
            this.populated = true;
            this.options = _.defaultsDeep(normalize(optionsFromDOM(viewEl)), this.options);
            this.setData(this.options);
        }
        else {
            this.initElement(this.createContainer());
            this.setData(this.options);
        }
        this.loading = new Loading(this.viewEl);
        this.resizeContainer = this._resizeContainer.bind(this);
    }

    View.prototype.initElement = function (viewEl) {
        assert(viewEl, '.rt-view not exist');
        this.viewEl = viewEl;
        this.viewEl.setAttribute('data-base', this.options.baseUrl || '');

        this.headEl = this.viewEl.querySelector('.rt-head');
        assert(this.headEl, '.rt-view>.rt-head not exist');

        this.bodyEl = this.viewEl.querySelector('.rt-body');
        assert(this.bodyEl, '.rt-view>rt-body not exist');

        this.viewEl.ralltiir = this;
    };

    View.prototype.render = function () {
        var self = this;
        // return this.pendingFetch
        return Promise.resolve()
        .then(function () {
            self.performance.domLoading = Date.now();

            var height = supportCalcHeight
                ? 'calc(100vh - ' + self.headEl.clientHeight + 'px)'
                : self._getViewerHeight() + 'px'
            ;
            // debugger;
            self.loader = new Loader({
                url: self.backendUrl,
                useMipCache: false,
                viewer: {
                    target: self.bodyEl,
                    height: height
                }
            });
            handleMessages(self);

            self.loader.on(self.options.notMip ? 'complete' : 'mip-mippageload', function () {
                self.loading.hide();
            });

            self.loader.create();
            self.loader.attach();

            // self.loading.hide();

            // var view = docfrag.querySelector('.rt-view');
            // if (!view) {
            //     var message = '".rt-view" not found in retrieved HTML'
            //     + '(from ' + self.backendUrl + ' )'
            //     + 'abort rendering...';
            //     throw new Error(message);
            // }
            // self.renderer.moveClasses(view, self.viewEl);

            // return Promise.resolve()
            // .then(function () {
            //     // return self.renderer.render(self.headEl, docfrag.querySelector('.rt-head'), {
            //     //     replace: true,
            //     //     onContentLoaded: function normalizeSSR() {
            //     //         var opts = optionsFromDOM(dom.wrapElementFromString(html));
            //     //         self.setData(normalize(opts));
            //     //     }
            //     // })
            //     // .catch(function (err) {
            //     //     err.code = err.code || 910;
            //     //     throw err;
            //     // });
            // })
            // .then(function () {
            //     // self.performance.headInteractive = Date.now();
            //     // return self.renderer.render(self.bodyEl, docfrag.querySelector('.rt-body'), {
            //     //     replace: true,
            //     //     onContentLoaded: function normalizeSSR() {
            //     //         self.performance.domContentLoaded = Date.now();
            //     //     }
            //     // })
            //     // .catch(function (err) {
            //     //     err.code = err.code || 911;
            //     //     throw err;
            //     // });
            // });
        })
        .then(function () {
            self.populated = true;
        })
        .catch(function (err) {
            err.code = err.code || 919;
            throw err;
        });
    };

    View.prototype.partialUpdate = function (url, options) {
        url = this.resolveUrl(url);

        var renderer = this.renderer;
        var body = this.bodyEl;
        var to = options.to ? body.querySelector(options.to) : body;
        var data = {url: url, options: options};
        var loading = new Loading(to);

        if (url !== location.pathname + location.search) {
            this.valid = false;
        }

        if (!options.to) {
            options.to = '.rt-body';
        }

        if (!options.from) {
            options.from = options.to;
        }

        if (!options.fromUrl) {
            options.fromUrl = url;
        }

        dom.trigger(to, 'rt.willUpdate', data);

        if (options.replace) {
            to.innerHTML = '';
            loading.show();
        }

        var token = Math.random().toString(36).substr(2);
        to.setAttribute('data-rt-token', token);

        return this.fetch(URL.setQuery(options.fromUrl, {
            'rt-partial': 'true',
            'rt-selector': options.from
        }))
        .then(function (xhr) {
            loading.hide();

            if (to.getAttribute('data-rt-token') !== token) {
                return;
            }
            rt.action.reset(url, null, {silent: true});

            var docfrag = Render.parse(xhr.data || '');
            docfrag = options.from ? docfrag.querySelector(options.from) : docfrag;

            return renderer.render(to, docfrag, {replace: options.replace})
            .then(function () {
                dom.trigger(to, 'rt.updated', data);
            });
        })
        .catch(function (e) {
            // eslint-disable-next-line
            console.warn('partialUpdate Error, redirecting', e);
            location.href = url;
        });
    };

    View.prototype.setData = function (desc) {
        var headEl = this.headEl;

        this.updateTitleBarElement(headEl.querySelector('.rt-back'), desc.back);
        this.updateTitleBarElement(headEl.querySelector('.rt-title'), desc.title);
        this.updateTitleBarElement(headEl.querySelector('.rt-subtitle'), desc.subtitle);

        if (desc.actions) {
            var toolEl = headEl.querySelector('.rt-actions');
            toolEl.innerHTML = '';
            _.forEach(desc.actions, function (icon) {
                var iconEl = dom.elementFromString('<span class="rt-action">');
                icon.tryReplace = true;
                var resultIconEl = this.updateTitleBarElement(iconEl, icon);
                toolEl.appendChild(resultIconEl);
            }, this);
        }
    };

    View.prototype.resetStyle = function () {
        animation.resetStyle(this.viewEl);
    };

    View.prototype.setAttached = function () {
        var self = this;
        return new Promise(function (resolve) {
            self.resetStyle();
            self.restoreStates();
            self.attached = true;
            self.performance.domInteractive = Date.now();
            self._startListenResize();
            setTimeout(function () {
                self.trigger('rt.attached');
                resolve();
            });
        });
    };

    View.prototype.setActive = function () {
        this.trigger('rt.ready');
        dom.addClass(this.viewEl, 'active');
    };

    View.prototype.reuse = function () {
        rt.doc.appendChild(this.viewEl);
    };

    View.prototype.setDetached = function () {
        this.attached = false;
        this.viewEl.remove();
        this._stopListenResize();
        this.trigger('rt.detached');
    };

    View.prototype.trigger = function (event) {
        return dom.trigger(this.viewEl, event);
    };

    View.prototype.enter = function (useEnterAnimation) {
        this.trigger('rt.willAttach');
        logger.debug('[view.enter] resetting styles, useEnterAnimation', useEnterAnimation);
        this.resetStyle();
        if (!useEnterAnimation) {
            logger.debug('[view.enter] animation disabled restoreStates...');
            this.restoreStates();
            return Promise.resolve();
        }
        var el = this.viewEl;
        logger.debug('[view.enter] calling animaiton.enter with', this.scrollX, this.scrollY);
        return animation.enter(el, this.scrollX, this.scrollY);
    };

    View.prototype.prepareExit = function (useAnimation) {
        this.trigger('rt.willDetach');
        this.scrollX = window.scrollX;
        this.scrollY = window.scrollY;
        logger.debug('[view.prepareExit] saving scrollX/scrollY', this.scrollX, this.scrollY);
        dom.removeClass(this.viewEl, 'active');
        // need prepare regardless useAnimation, scrollTop will be effected otherwise
        return animation.prepareExit(this.viewEl, this.scrollX, this.scrollY);
    };

    View.prototype.exit = function (useAnimation) {
        return useAnimation
            ? animation.exit(this.viewEl, this.scrollX, this.scrollY)
            : animation.exitSilent(this.viewEl);
    };

    View.prototype.destroy = function () {
        this.trigger('rt.destroyed');
        this.viewEl.remove();
        delete this.viewEl;
        delete this.headEl;
        delete this.bodyEl;
    };

    View.prototype.restoreStates = function () {
        logger.debug('restoring states to', this.scrollX, this.scrollY);
        if (this.hasOwnProperty('scrollX')) {
            scrollTo(this.scrollX, this.scrollY);
        }
    };

    View.prototype.fetchUrl = function (url) {
        this.loading.show();
        this.pendingFetch = this.fetch(url);
    };

    View.prototype.fetch = function (url, headers) {
        this.backendUrl = this.getBackendUrl(url);
        this.backendUrl = URL.setQuery(this.backendUrl, 'rt', 'true');
        this.performance.requestStart = Date.now();
        return Promise.resolve(null);
        // return http.ajax(this.backendUrl, {
        //     headers: headers || {},
        //     xhrFields: {withCredentials: true}
        // })
        // .catch(function (err) {
        //     err.code = err.status || 900;
        //     throw err;
        // });
    };

    View.prototype.getBackendUrl = function (url) {
        if (_.isFunction(this.options.backendUrl)) {
            return this.options.backendUrl(url);
        }
        if (_.isString(this.options.backendUrl)) {
            return this.options.backendUrl;
        }
        var root = rt.action.config().root.replace(/\/+$/, '');
        return root + url;
    };

    View.backHtml = '<i class="c-icon">&#xe750;</i>';

    function normalize(options) {
        options = options || {};
        options = _.cloneDeep(options);
        if (_.get(options, 'back.html') === undefined
            && history.length > 1) {
            _.set(options, 'back.html', '<rt-back>' + View.backHtml + '</rt-back>');
        }
        return options;
    }

    function prepareEnvironment() {
        // ios 设为 manual 时回退时页面不响应 1s
        if (('scrollRestoration' in history) && !ua.isIOS) {
            // Back off, browser, I got this...
            history.scrollRestoration = 'manual';
        }
    }

    function optionsFromDOM(el) {
        var headEl = el.querySelector('.rt-head');
        var ret = {};

        var backEl = headEl.querySelector('.rt-back');
        if (backEl && backEl.innerHTML) {
            ret.back = {html: backEl.innerHTML};
        }

        var titleEl = headEl.querySelector('.rt-title');
        if (titleEl && titleEl.innerHTML) {
            ret.title = {html: titleEl.innerHTML};
        }

        var subtitleEl = headEl.querySelector('.rt-subtitle');
        if (subtitleEl && subtitleEl.innerHTML) {
            ret.subtitle = {html: subtitleEl.innerHTML};
        }

        var actionEl = headEl.querySelector('.rt-actions');
        if (actionEl && actionEl.children.length) {
            ret.actions = [];
            _.forEach(actionEl.children, function (el) {
                if (el && el.outerHTML) {
                    ret.actions.push({html: el.outerHTML});
                }
            });
        }

        return ret;
    }

    View.prototype._resizeContainer = function () {
        // console.log('_resizeContainer', this);
        if (this.headEl && this.bodyEl) {
            var height = this._getViewerHeight();
            // console.log('height', height);
            this.loader.setConfig({
                viewer: {
                    height: height + 'px'
                }
            });
        }
    };

    View.prototype._getViewerHeight = function () {
        if (this.headEl) {
            var height = window.innerHeight - this.headEl.clientHeight;
            return height;
        }
        return window.innerHeight - 44;
    };

    View.prototype._startListenResize = function () {
        logger.debug('_startListenResize', supportCalcHeight);
        if (!supportCalcHeight && this.loader) {
            window.addEventListener('resize', this.resizeContainer);
        }
    };

    View.prototype._stopListenResize = function () {
        logger.debug('_stopListenResize', supportCalcHeight);
        if (!supportCalcHeight && this.loader) {
            window.removeEventListener('resize', this.resizeContainer);
        }
    };

    View.prototype.createContainer = function () {
        var viewEl = dom.elementFromString(html);
        rt.doc.appendChild(viewEl);
        return viewEl;
    };

    View.prototype.updateTitleBarElement = function (el, options) {
        if (_.has(options, 'html')) {
            el.innerHTML = options.html || '';
            // special markups
            if (el.querySelector('rt-back')) {
                el.innerHTML = el.innerHTML || View.backHtml;
                options.onClick = action.back.bind(action);
            }
            else if (el.querySelector('rt-empty')) {
                el.innerHTML = '';
            }
            if (options.tryReplace && el.children.length) {
                el = el.children[0];
            }
        }
        if (!el.rtClickHandler) {
            el.rtClickHandler = _.noop;
            el.addEventListener('click', function () {
                el.rtClickHandler();
            });
        }
        if (_.has(options, 'onClick')) {
            el.rtClickHandler = _.get(options, 'onClick');
        }
        return el;
    };

    View.prototype.resolveUrl = function (url) {
        return this.options.baseUrl + url;
    };

    return View;
});
