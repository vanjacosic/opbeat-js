;(function(window, undefined){
'use strict';

// First, check for JSON support
// If there is no JSON, we no-op the core features of Opbeat
// since JSON is required to encode the payload
var _Opbeat = window.Opbeat,
    hasJSON = !!(window.JSON && window.JSON.stringify),
    lastCapturedException,
    lastEventId,
    globalServer,
    globalUser,
    globalOptions = {
        api_host: 'https://opbeat.com',
        logger: 'javascript',
        collectHttp: true,
        ignoreErrors: [],
        ignoreUrls: [],
        whitelistUrls: [],
        includePaths: [],
        collectWindowErrors: true,
        extra: {
            frame_info: {}
        }
    },
    isOpbeatInstalled = false,
    frameInfoCounter = 1;

/*
 * The core Opbeat singleton
 *
 * @this {Opbeat}
 */
var Opbeat = {
    VERSION: '0.0.1',

    debug: true,

    /*
     * Allow multiple versions of Opbeat to be installed.
     * Strip Opbeat from the global context and returns the instance.
     *
     * @return {Opbeat}
     */
    noConflict: function() {
        window.Opbeat = _Opbeat;
        return Opbeat;
    },

    /*
     * Configure Opbeat with Opbeat.com credentials and other options
     *
     * @param {object} options Optional set of of global options
     * @return {Opbeat}
     */
    config: function(options) {
        if (globalServer) {
            logDebug('error', 'Error: Opbeat has already been configured');
            return Opbeat;
        }

        if (!options) return Opbeat;

        // Merge in options
        each(options, function(key, value){
            globalOptions[key] = value;
        });

        // "Script error." is hard coded into browsers for errors that it can't read.
        // this is the result of a script being pulled in from an external domain and CORS.
        globalOptions.ignoreErrors.push('Script error.');
        globalOptions.ignoreErrors.push('Script error');

        // Other variants of external script errors:
        globalOptions.ignoreErrors.push('Javascript error: Script error on line 0');
        globalOptions.ignoreErrors.push('Javascript error: Script error. on line 0');

        // join regexp rules into one big rule
        globalOptions.ignoreErrors = joinRegExp(globalOptions.ignoreErrors);
        globalOptions.ignoreUrls = globalOptions.ignoreUrls.length ? joinRegExp(globalOptions.ignoreUrls) : false;
        globalOptions.whitelistUrls = globalOptions.whitelistUrls.length ? joinRegExp(globalOptions.whitelistUrls) : false;
        globalOptions.includePaths = joinRegExp(globalOptions.includePaths);


        // Assemble the API endpoint
        globalServer = globalOptions.api_host +
                       '/api/v1/organizations/' + 
                       globalOptions.orgId + '/apps/' + 
                       globalOptions.appId + '/errors.gif';

        if (globalOptions.fetchContext) {
            TraceKit.remoteFetching = true;
        }

        if (globalOptions.linesOfContext) {
            TraceKit.linesOfContext = globalOptions.linesOfContext;
        }

        TraceKit.collectWindowErrors = !!globalOptions.collectWindowErrors;

        // return for chaining
        return Opbeat;
    },

    /*
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     * At this point, install() is required to be called due
     * to the way TraceKit is set up.
     *
     * @return {Opbeat}
     */
    install: function() {
        if (isSetup() && !isOpbeatInstalled) {
            TraceKit.report.subscribe(handleStackInfo);
            isOpbeatInstalled = true;
        }

        return Opbeat;
    },

    /*
     * Wrap code within a context so Opbeat can capture errors
     * reliably across domains that is executed immediately.
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The callback to be immediately executed within the context
     * @param {array} args An array of arguments to be called with the callback [optional]
     */
    context: function(options, func, args) {
        if (isFunction(options)) {
            args = func || [];
            func = options;
            options = undefined;
        }

        return Opbeat.wrap(options, func).apply(this, args);
    },

    /*
     * Wrap code within a context and returns back a new function to be executed
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The function to be wrapped in a new context
     * @return {function} The newly wrapped functions with a context
     */
    wrap: function(options, func) {
        // 1 argument has been passed, and it's not a function
        // so just return it
        if (isUndefined(func) && !isFunction(options)) {
            return options;
        }

        // options is optional
        if (isFunction(options)) {
            func = options;
            options = undefined;
        }

        // At this point, we've passed along 2 arguments, and the second one
        // is not a function either, so we'll just return the second argument.
        if (!isFunction(func)) {
            return func;
        }

        // We don't wanna wrap it twice!
        if (func.__opbeat__) {
            return func;
        }

        function wrapped() {
            var args = [], i = arguments.length,
                deep = !options || options && options.deep !== false;
            // Recursively wrap all of a function's arguments that are
            // functions themselves.

            while(i--) args[i] = deep ? Opbeat.wrap(options, arguments[i]) : arguments[i];

            try {
                /*jshint -W040*/
                return func.apply(this, args);
            } catch(e) {
                Opbeat.captureException(e, options);
                throw e;
            }
        }

        // copy over properties of the old function
        for (var property in func) {
            if (hasKey(func, property)) {
                wrapped[property] = func[property];
            }
        }

        // Signal that this function has been wrapped already
        // for both debugging and to prevent it to being wrapped twice
        wrapped.__opbeat__ = true;
        wrapped.__inner__ = func;

        return wrapped;
    },

    /*
     * Uninstalls the global error handler.
     *
     * @return {Opbeat}
     */
    uninstall: function() {
        TraceKit.report.uninstall();
        isOpbeatInstalled = false;

        return Opbeat;
    },

    /*
     * Manually capture an exception and send it over to Opbeat.com
     *
     * @param {error} ex An exception to be logged
     * @param {object} options A specific set of options for this error [optional]
     * @return {Opbeat}
     */
    captureException: function(ex, options) {
        // If not an Error is passed through, recall as a message instead
        if (!(ex instanceof Error)) return Opbeat.captureMessage(ex, options);

        // Store the raw exception object for potential debugging and introspection
        lastCapturedException = ex;

        // TraceKit.report will re-raise any exception passed to it,
        // which means you have to wrap it in try/catch. Instead, we
        // can wrap it here and only re-raise if TraceKit.report
        // raises an exception different from the one we asked to
        // report on.
        try {
            TraceKit.report(ex, options);
        } catch(ex1) {
            if(ex !== ex1) {
                throw ex1;
            }
        }

        return Opbeat;
    },

    /*
     * Manually send a message to Opbeat.com
     *
     * @param {string} msg A plain message to be captured in Opbeat.com
     * @param {object} options A specific set of options for this message [optional]
     * @return {Opbeat}
     */
    captureMessage: function(msg, options) {
        // Fire away!
        send(
            objectMerge({
                message: msg + ''  // Make sure it's actually a string
            }, options)
        );

        return Opbeat;
    },

    /*
     * Set/clear a user to be sent along with the payload.
     *
     * @param {object} user An object representing user data [optional]
     * @return {Opbeat}
     */
    setUserContext: function(user) {
       globalUser = user;

       return Opbeat;
    },

    /*
     * Set extra attributes to be sent along with the payload.
     *
     * @param {object} extra An object representing extra data [optional]
     * @return {Opbeat}
     */
    setExtraContext: function(extra) {
       globalOptions.extra = extra || {};
	
       return Opbeat;
    },

    /*
     * Get the latest raw exception that was captured by Opbeat.
     *
     * @return {error}
     */
    lastException: function() {
        return lastCapturedException;
    },

    /*
     * Get the last event id
     *
     * @return {string}
     */
    lastEventId: function() {
        return lastEventId;
    }
};

Opbeat.setUser = Opbeat.setUserContext; // To be deprecated

function triggerEvent(eventType, options) {
    var event, key;

    options = options || {};

    eventType = 'opbeat' + eventType.substr(0,1).toUpperCase() + eventType.substr(1);

    if (document.createEvent) {
        event = document.createEvent('HTMLEvents');
        event.initEvent(eventType, true, true);
    } else {
        event = document.createEventObject();
        event.eventType = eventType;
    }

    for (key in options) if (hasKey(options, key)) {
        event[key] = options[key];
    }

    if (document.createEvent) {
        // IE9 if standards
        document.dispatchEvent(event);
    } else {
        // IE8 regardless of Quirks or Standards
        // IE9 if quirks
        try {
            document.fireEvent('on' + event.eventType.toLowerCase(), event);
        } catch(e) {}
    }
}

function OpbeatConfigError(message) {
    this.name = 'OpbeatConfigError';
    this.message = message;
}
OpbeatConfigError.prototype = new Error();
OpbeatConfigError.prototype.constructor = OpbeatConfigError;

/**** Private functions ****/
function isUndefined(what) {
    return typeof what === 'undefined';
}

function isFunction(what) {
    return typeof what === 'function';
}

function isString(what) {
    return typeof what === 'string';
}

function isEmptyObject(what) {
    for (var k in what) return false;
    return true;
}

/**
 * hasKey, a better form of hasOwnProperty
 * Example: hasKey(MainHostObject, property) === true/false
 *
 * @param {Object} host object to check property
 * @param {string} key to check
 */
function hasKey(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function each(obj, callback) {
    var i, j;

    if (isUndefined(obj.length)) {
        for (i in obj) {
            if (hasKey(obj, i)) {
                callback.call(null, i, obj[i]);
            }
        }
    } else {
        j = obj.length;
        if (j) {
            for (i = 0; i < j; i++) {
                callback.call(null, i, obj[i]);
            }
        }
    }
}


function handleStackInfo(stackInfo, options) {
    var frames = [];

    if (stackInfo.stack && stackInfo.stack.length) {
        each(stackInfo.stack, function(i, stack) {
            var frame = normalizeFrame(stack);
            if (frame) {
                frames.push(frame);
            }
        });
    }

    triggerEvent('handle', {
        stackInfo: stackInfo,
        options: options
    });

    processException(
        stackInfo.name,
        stackInfo.message,
        stackInfo.url,
        stackInfo.lineno,
        frames,
        options
    );
}

function normalizeFrame(frame) {
    if (!frame.url) return;

    // Construct a frame message to be added to the Extra tab because
    // Opbeat.com interface currently doesn't show column number in stacktrace
    var frameMessage = 'File: ' + (frame.url || '?') +
                        ', Line: ' + (frame.line || '?') +
                        ', Column: ' + (frame.column || '?') +
                        ', Func: ' + (frame.func || '?') ;

    // Add frame message to Extra payload
    globalOptions.extra.frame_info = globalOptions.extra.frame_info || {};
    globalOptions.extra.frame_info['frame_' + frameInfoCounter++] = frameMessage;

    // normalize the frames data
    var normalized = {
        filename:   frame.url,
        lineno:     frame.line,
        colno:      frame.column,
        'function': frame.func || '?'
    }, context = extractContextFromFrame(frame), i;

    if (context) {
        var keys = ['pre_context', 'context_line', 'post_context'];
        i = 3;
        while (i--) normalized[keys[i]] = context[i];
    }

    normalized.in_app = !( // determine if an exception came from outside of our app
        // first we check the global includePaths list.
        !globalOptions.includePaths.test(normalized.filename) ||
        // Now we check for fun, if the function name is Opbeat or TraceKit
        /(Opbeat|TraceKit)\./.test(normalized['function']) ||
        // finally, we do a last ditch effort and check for opbeat.min.js
        /opbeat\.(min\.)?js$/.test(normalized.filename)
    );

    return normalized;
}

function extractContextFromFrame(frame) {
    // immediately check if we should even attempt to parse a context
    if (!frame.context || !globalOptions.fetchContext) return;

    var context = frame.context,
        pivot = ~~(context.length / 2),
        i = context.length, isMinified = false;

    while (i--) {
        // We're making a guess to see if the source is minified or not.
        // To do that, we make the assumption if *any* of the lines passed
        // in are greater than 300 characters long, we bail.
        // Opbeat.com will see that there isn't a context
        if (context[i].length > 300) {
            isMinified = true;
            break;
        }
    }

    if (isMinified) {
        // The source is minified and we don't know which column. Fuck it.
        if (isUndefined(frame.column)) return;

        // If the source is minified and has a frame column
        // we take a chunk of the offending line to hopefully shed some light
        return [
            [],  // no pre_context
            context[pivot].substr(frame.column, 50), // grab 50 characters, starting at the offending column
            []   // no post_context
        ];
    }

    return [
        context.slice(0, pivot),    // pre_context
        context[pivot],             // context_line
        context.slice(pivot + 1)    // post_context
    ];
}

function processException(type, message, fileurl, lineno, frames, options) {
    var stacktrace, label, i;

    // In some instances message is not actually a string, no idea why,
    // so we want to always coerce it to one.
    message += '';

    // Sometimes an exception is getting logged in Opbeat.com as
    // <no message value>
    // This can only mean that the message was falsey since this value
    // is hardcoded into Opbeat.com itself.
    // At this point, if the message is falsey, we bail since it's useless
    if (type === 'Error' && !message) return;

    if (globalOptions.ignoreErrors.test(message)) return;

    if (frames && frames.length) {
        fileurl = frames[0].filename || fileurl;
        // Opbeat.com expects frames oldest to newest
        // and JS sends them as newest to oldest
        frames.reverse();
        stacktrace = {frames: frames};
    } else if (fileurl) {
        stacktrace = {
            frames: [{
                filename: fileurl,
                lineno: lineno,
                in_app: true
            }]
        };
    }

    // Truncate the message to a max of characters
    message = truncate(message, 100);

    if (globalOptions.ignoreUrls && globalOptions.ignoreUrls.test(fileurl)) return;
    if (globalOptions.whitelistUrls && !globalOptions.whitelistUrls.test(fileurl)) return;

    label = lineno ? message + ' at ' + lineno : message;

    // Fire away!
    send(
        objectMerge({
            exception: {
                type: type,
                value: message
            },
            stacktrace: stacktrace,
            culprit: fileurl,
            message: label
        }, options)
    );
}

function objectMerge(obj1, obj2) {
    if (!obj2) {
        return obj1;
    }
    each(obj2, function(key, value){
        obj1[key] = value;
    });
    return obj1;
}

function truncate(str, max) {
    return str.length <= max ? str : str.substr(0, max) + '\u2026';
}

function getHttpData() {

    if (!globalOptions.collectHttp) {
        return null;
    }
    
    var http = {
        url: document.location.href,
        headers: {
            'User-Agent': navigator.userAgent
        }
    };

    if (document.referrer) {
        http.headers.Referer = document.referrer;
    }

    return http;
}

function send(data) {
    if (!isSetup()) return;

    data = objectMerge({
        client_version: 'opbeat-js/' + Opbeat.VERSION,
        logger: globalOptions.logger,
        http: getHttpData()
    }, data);

    // Merge in the extras separately since objectMerge doesn't handle a deep merge
    data.extra = objectMerge(globalOptions.extra, data.extra);

    // If there are no extras, strip the key from the payload alltogther.
    if (isEmptyObject(data.extra)) delete data.extra;

    if (globalUser) {
        data.user = globalUser;
        data.user.is_authenticated = true; // Required by API
    }

    if (isFunction(globalOptions.dataCallback)) {
        data = globalOptions.dataCallback(data);
    }

    // Check if the request should be filtered or not
    if (isFunction(globalOptions.shouldSendCallback) && !globalOptions.shouldSendCallback(data)) {
        return;
    }

    // Send along an client_supplied_id if not explicitly passed.
    // This client_supplied_id can be used to reference the error on Opbeat.com
    // Set lastEventId after we know the error should actually be sent
    lastEventId = data.client_supplied_id || (data.client_supplied_id = uuid4());

    makeRequest(data);

    // Clear extra frame info after each send
    globalOptions.extra.frame_info = {};
    frameInfoCounter = 1;
}


function makeRequest(data) {
    var img = new Image();
    var src = globalServer + '?data=' + encodeURIComponent(JSON.stringify(data));

    img.onload = function success() {
        triggerEvent('success', {
            data: data,
            src: src
        });
    };
    img.onerror = img.onabort = function failure() {
        triggerEvent('failure', {
            data: data,
            src: src
        });
    };
    img.src = src;
}

function isSetup() {
    if (!hasJSON) return false;  // needs JSON support
    if (!globalServer) {
        logDebug('error', 'Error: Opbeat has not been configured.');
        return false;
    }
    return true;
}

function joinRegExp(patterns) {
    // Combine an array of regular expressions and strings into one large regexp
    // Be mad.
    var sources = [],
        i = 0, len = patterns.length,
        pattern;

    for (; i < len; i++) {
        pattern = patterns[i];
        if (isString(pattern)) {
            // If it's a string, we need to escape it
            // Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
            sources.push(pattern.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"));
        } else if (pattern && pattern.source) {
            // If it's a regexp already, we want to extract the source
            sources.push(pattern.source);
        }
        // Intentionally skip other cases
    }
    return new RegExp(sources.join('|'), 'i');
}

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
function uuid4() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0,
            v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function logDebug(level, message) {
    if (window.console && console[level] && Opbeat.debug) {
        console[level](message);
    }
}

// Expose Opbeat
window.Opbeat = Opbeat;

// AMD
if (typeof define === 'function' && define.amd) {
    define('opbeat', [], function() { return Opbeat; });
}

})(this);
