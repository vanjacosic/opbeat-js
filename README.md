# Opbeat.js

**Experimental** client for logging errors (exceptions) and stacktraces to [Opbeat](http://opbeat.com/) from within
your client-side (browser) JavaScript applications.

For Node.js applications, please see the [opbeat-node](https://github.com/opbeat/opbeat-node) client instead.

## Usage

Check out `/example` for an example of usage.

1. Edit the credentials in `example.js` to match your Opbeat organization and app.
1. Open `index.html`
1. Click a button to trigger an exception and log it to Opbeat

**NOTE:** To be able to log clientside errors to Opbeat, your organization needs to have the feature flag enabled. Send Opbeat a message and they will enable it for you.

## Documentation

Please refer to the [sourcecode](https://github.com/vanjacosic/opbeat-js/blob/master/src/opbeat.js) or the [raven-js documentation](https://raven-js.readthedocs.org/en/latest/) for now. 

Basic documentation will be written once the library has been tested and is in a more stable state.

## Contributing

Feel free to help out with testing and developing this thing. Issues and Pull Requests are very welcome!

## Development usage

1. Run `npm install gulp -g` to install `gulp`
1. Run `npm install` to install dependencies
1. Change the credentials to match your Opbeat app in `example.js`
1. Run `gulp watch` to start the preview server on `localhost:7000`

This process watches and compiles dist versions of the client. It also livereloads the assets for the example application for a better development/testing workflow.

## License & origin

This client is based very heavily on the work that [Matt Robenolt](https://github.com/mattrobenolt) and others did on the [raven-js client](https://github.com/getsentry/raven-js/) for Sentry (as noted in the LICENSE.md). This started out as a fork of Raven and is now incompatible with Sentry, therefore it has been renamed to avoid confusing anyone.

Created by [Vanja Cosic](https://github.com/vanjacosic) (Frontend developer at Opbeat) as a hackday experiment, but is not officially supported by Opbeat... yet ;)
