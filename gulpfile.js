var gulp = require('gulp');
var refresh = require('gulp-livereload');
var serve = require('gulp-serve');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var lr = require('tiny-lr');
var server = lr();

// Livereload server
gulp.task('lr-server', function() {
    server.listen(35723, function(err) {
        if(err) return console.log(err);
    });
});

// Static file server
gulp.task('server', serve({
    root: ['example', 'dist'],
    port: 7000
}));

// Task for refreshing everything (HTML, etc)
gulp.task('refresh-browser', function() {
    gulp.src('package.json', {read: false})
        .pipe(refresh(server));
});

// Files to bundle
JS_DIST_FILES = [
    'libs/tracekit.js',
    'src/raven.js'
];

// Bundles files into
gulp.task('process-scripts', function() {
    gulp.src(JS_DIST_FILES)
        .pipe(concat('raven.js'))
        .pipe(gulp.dest('./dist'))
        .pipe(uglify().on('error', function(e) { console.log('\x07',e.message); return this.end(); }))
        .pipe(concat('raven.min.js'))
        .pipe(gulp.dest('./dist'))
        .pipe(refresh(server));
});

// Development mode
gulp.task('watch', [], function(cb){

    gulp.run(
        'process-scripts',
        'lr-server',
        'server'
    );

    // Watch JS files
    gulp.watch(['libs/**', 'src/**'], ['process-scripts']);

    // Watch example files
    gulp.watch('example/**', ['refresh-browser']);
});