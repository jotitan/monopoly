const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlReplaceWebpackPlugin = require('html-replace-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');

const webpackConf = require('webpack'); //to access built-in plugins

const path = require('path');

module.exports = {
    entry: './js/core/monopoly.js',
    mode: 'production',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'my-bundle.js'
    },
    module: {
        rules: [
            {
                test: /monopoly\.js$/,
                loader: 'string-replace-loader',
                options: {
                    search: /let debug = true;/i,
                    replace: 'let debug = false;'
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({template: './monopoly-template.html'}),
        new HtmlReplaceWebpackPlugin([
            {
                pattern: '<script type="module" src="js/core/monopoly.js"></script>',
                replacement: ''
            }]),
        new CopyPlugin({
            patterns: [
                {from: "css", to: "css"},
                {from: "img", to: "img"},
                {from: "lib", to: "lib"},
                {from: "data", to: "data"},
            ],
        }),
        new ZipPlugin({
            path: '',
            filename: 'monopoly_build.zip',
        })
    ]

};