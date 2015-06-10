/**
 * Base Page
 */
var $ = require('zepto');

var config = require('runtime').config,
    tploader = require('tploader'),
    scroller = require('scroller');

var BasePage = function (conf) {
    conf = conf || {};
    this.id = conf.id; //view id
    this.type = 'page'; //view类型
    this.templateId = conf.templateId || this.id; //模板
    this.eventHandlers = {}; //事件句柄
    this.timers = {}; //定时器
    this.callbacks = conf; //回调
    this.container = $(conf.container || config.pageContainer); //父容器
    this.dom = null; //dom对象
    this.cachable = conf.cachable || false; //是否可以缓存，即在页面unload时只隐藏不销毁
    this.reloadOnQueryChanged = conf.reloadOnQueryChanged || false; //当页面参数改变时是否重新加载
    this.styles = [];
    this.srollTop = 0;
    this.title = conf.title || '';
    this.actionRended = false;
    this.tpl = conf.tpl;//主页面模板

    tploader.set(this.tpl.tplKey, this.tpl.tplValue);//将模板添加到缓存
}

BasePage.prototype = {
    load: function (action, datas) {
        var _this = this;
        this.url = location.hash;
        this.invoke('preload', [datas]);

        var data = $.extend(this.invoke('setData') || {}, {
            id: this.id
        });

        _this.rend(_this.tpl.tplValue, data);
        _this.invoke('load', [datas]);
            
        _this.setTitle();
        _this.callAction(action, datas);

    },
    callAction: function(action, datas){
        action = action || 'index';
        var _this = this;
            actionMethod = this['action' + action.replace(/^./, function(w){
                return w.toUpperCase();
            })],
            factory = actionMethod,
            callback = function(){},
            done = function(tplDatas){
                if(tplDatas === false){
                    return;    
                }
                
                callback(datas);
                
            };
        $.each(this.eventHandlers, function (handler, data) {
            _this.unbind(data[0], data[1], handler);
        });
        if(typeof actionMethod === 'object' && actionMethod instanceof BasePage.Action){
            factory = actionMethod.factory;
            callback = actionMethod.callback;
        }
        if(factory.length === 2){
            factory.call(this, datas, done);
        }else{
            done(factory.call(this, datas));
        }
    },
    actionIndex: function(){},
    lazyload: function (obj) {
        try {
            var obj = obj || {},
                scrollTop = obj.scrollTop || document.documentElement.scrollTop + document.body.scrollTop,
                winHeight = obj.windowHeight || $(window).height(),
                height = scrollTop + winHeight * config.imgPreload;

            $('img[data-src]').each(function (_, o) {
                var top = parseInt($(o).data('top'), 10);
                if (!top >= 0) {
                    top = $(o).offset().top;
                    $(o).data('top', top);
                }
                if (top <= height) {
                    o.src = $(o).data('src');
                    o.removeAttribute('data-src');
                } else {
                    throw new Error('break');
                }
            });
        } catch (_) {
            return;
        }
    },
    rend: function (tpl, data) {
        var elmId = this.type + '_' + this.id,
            content = tpl(data),
            _this = this;
        this.container.append('<div class="spa-' + this.type + '" id="' + elmId + '"></div>');
        this.dom = $('#' + elmId);
        document.documentElement.id = 'document_'+this.id;
        document.documentElement.dataset.page = this.id;
        var pagecache = sessionStorage['pagecache-' + encodeURIComponent(this.url)];
        var listPageCache = sessionStorage['listPage-' + encodeURIComponent(this.url)];
        if(pagecache && listPageCache){
            this.dom.html(pagecache);
            this.actionRended = true;
            window.scrollTo(0,  this.scrollTop || sessionStorage['scrolltop-' + encodeURIComponent(this.url)] || 0);
        }else{
            this.dom.html(content);
        }
        this.invoke('rended', [data]);
        this.lazyload();
        this.bind(window, 'scroll', function (obj) {
            _this.lazyload();
            _this.scrollTop = obj.scrollTop;
        });
    },
    template: function(tpl, data){
        return tpl(data);
    },
    unload: function () {
        this.invoke('preunload');
        var _this = this;
        if (this.cachable && this.dom) {
            //this.dom.hide();
            console.log('pagecache-' + encodeURIComponent(this.url));
            sessionStorage['pagecache-' + encodeURIComponent(this.url)] = this.dom.html();
        }
        //} else {
        if (this.dom) {
            this.dom.remove();
            this.dom = null;
        }
        $.each(this.eventHandlers, function (handler, data) {
            _this.unbind(data[0], data[1], handler);
        });
        $.each(this.timers, function (timer, _) {
            _this.clearInterval(timer);
        });
        scroller.unload(this.id);
        setTimeout(function () {
            tploader.removeStyle(_this.styles);
            _this.styles = [];
        }, 100);
        //}
        this.invoke('unload');
        sessionStorage['scrolltop-' + encodeURIComponent(this.url)] = this.scrollTop;
    },
    queryChanged: function (action, datas) {
        this.invoke('querychanged', [datas]);
        this.callAction(action, datas);
    },
    bind: function (elm, evt, handler) {
        if (elm === window || elm === 'window' && evt === 'scroll') {
            scroller.bind(this.id, handler);
            return;
        }
        if(typeof elm !== 'string'){
            elm = elm.selector;
        }
        if(!elm){
            throw new Error("Invaild parameter: elm");
        }
        this.eventHandlers[handler] = [elm, evt];
        $(document.body).delegate(elm, evt, handler);
    },
    unbind: function (elm, evt, handler) {
        delete this.eventHandlers[handler];
        $(document.body).undelegate(elm, evt);
    },
    setInterval: function (handler, interval) {
        var timer = setInterval(handler, interval);
        this.timers[timer] = 1;
        return timer;
    },
    clearInterval: function (timer) {
        clearInterval(timer);
        delete this.timers[timer];
    },
    invoke: function (evt, params) {
        var callback = this.callbacks[evt];
        if (typeof callback != 'function') {
            return;
        }
        return callback.apply(this, params);
    },
    setTitle: function (title) {
        if (title) {
            this.title = title;
        }
        $('#page-title').text(this.title);
        var $body = $('body');
        document.title = this.title;
    },
    redirect: function (params) {
        if(typeof params === 'string'){
            location.hash = params;    
        }else if(typeof params === 'object'){
            var id = params.id || this.id,
                action = params.action || 'index';
            delete params.id;
            delete params.action;
            var url = '#' + id + '/' + action;
            $.each(params, function (k, v) {
                if (url.indexOf('?') < 0) {
                    url += '?';
                }
                url += '&' + k + '=' + v;
            });
            location.hash = url;
        }else{
            return;    
        }
    }
}

BasePage.Action = function(options){
    this.factory = options.factory || function(){return {}};
    this.callback = options.callback || function(){};
}

module.exports = BasePage;