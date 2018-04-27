define(function (require) {
    var rt = require('ralltiir');
    // 熊掌号登录相关逻辑
    function setupLogin(view) {
        // 构建登录所需的 url
        var oobUrl = location.protocol + '//' + location.host + '/oob.html?';
        var authUrl = 'https://openapi.baidu.com/oauth/2.0/authorize?response_type=code&scope=snsapi_userinfo';

        // MIP 页面请求登录
        // 打开新页面，携带 login=1 的 url 参数（为了区别缓存）
        // 将当前的 options 都存到 prevOptions 里，一并传过去
        view.loader.on('mip-login-xzh', function (_, event) {
            var state = event.data.state;
            var clientId = event.data.clientId;
            if (!state || !clientId) {
                console.error('state and clientid are required!');
                return;
            }
            var redirectUrl = oobUrl + '&url=' + encodeURIComponent(location.pathname + location.search);
            var iframedUrl = authUrl
                + '&client_id=' + encodeURIComponent(clientId)
                + '&redirect_uri=' + encodeURIComponent(redirectUrl)
                + '&state=' + encodeURIComponent(state)
                + '&_=' + Date.now();
            var options = {
                backendUrl: iframedUrl
            };
            rt.action.redirect('/login.html', null, options);
        });
        // MIP 页面登录完成回调
        // 找 prevOptions 然后继续放过去
        view.loader.on('mip-login-xzh-oob', function (_, event) {
            var state = event.data.state;
            var code = event.data.code;
            var url = event.data.url;
            if (!state || !code || event.data.status !== 'success') {
                // 登录失败……
                console.error('missing state or code or data');
                rt.back();
                return;
            }
            rt.action.reset(url, null, {
                backendUrl: url 
                    + '#state=' + encodeURIComponent(state)
                    + '&code=' + encodeURIComponent(code)
                    + '&redirect_uri=' + encodeURIComponent(oobUrl + '&url=' + encodeURIComponent(url))
                    + '&_'
            });
        });
    }

    // 百度钱包支付相关逻辑
    function setupSimplePay(view) {
        // 构建登录所需的 url
        view.loader.on('mip-simple-pay', function (_, event) {
            var url = event.data.url;
            if (!url || !url.match(/^https\:\/\/www\.baifubao\.com\/api\/0\/pay\/0\/wapdirect\//)) {
                console.log('Simple pay URL not allowed, only baifubao urls are allowed');
                return;
            }
            // 百度钱包在 iOS 11.3+ 下，iframe 会取不到跨域 cookies
            // 经测试换成 qianbao 二级域名就可以了
            var qianbaoUrl = url.replace(/^https\:\/\/www\.baifubao\.com\//, 'https://qianbao.baidu.com/');
            rt.action.redirect('/pay.html', null, {
                backendUrl: qianbaoUrl,
                notMip: true,
                iframeTopOffset: -44
            });
        });
    }

    function setupNewPage(view) {
        view.loader.on('mip-loadiframe', function (_, event) {
            var url = event.data.url;
            if (!url) {
                return;
            }
            var click = {};
            if (event.data.click) {
                try {
                    click = JSON.parse(event.data.click);
                }
                catch (e) {
                    click = {};
                }
            }
            var redirectUrl = '';
            var redirectFunction = click.replace ? 'reset' : 'redirect';
            var redirectOptions = {};
            if (url.match(/^(https?:)?\/\//)) {
                redirectUrl = '/external.html?url=' + encodeURIComponent(url);
                redirectOptions.backendUrl = url;
            }
            else {
                redirectUrl = url;
            }
            rt.action[redirectFunction](redirectUrl, null, redirectOptions);
        });
    }

    return function (view) {
        setupSimplePay(view);
        setupLogin(view);
        setupNewPage(view);
    };
});
