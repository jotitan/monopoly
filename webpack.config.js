const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
    mode: 'development',
    entry:{
        app:'./js/monopoly.js'
    },
    module:{
        rules:[{
            test:'/\.(jpg|png)$/',
            use:['html-loader']
        }]
    },
    plugins: [new HtmlWebpackPlugin({
        template:'./monopoly-import.html',
        filename:'monopoly.html'
    })]

};