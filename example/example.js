console.log('Example site loaded.');

// Configure client
Opbeat.config({
    api_host: 'http://0.0.0.0:9000',
    orgId: '21c3358438094c01acbb38554436497a',
    appId: '53d206094c'
}).install();

// Set user data
Opbeat.setUserContext({
    email: 'vanja@cosic.dk',
    id: 1
})

// Test functions
function multiply(a, b) {
    "use strict";
    return a * b;
}

function divide(a, b) {
    "use strict";
    try {
        return multiply(add(a, b), a, b) / c;
    } catch (e) {
        Opbeat.captureException(e);
    }
}