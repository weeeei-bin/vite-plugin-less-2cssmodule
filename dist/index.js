'use strict';

var parser = require('@babel/parser');
var traverse = require('@babel/traverse');
var generator = require('@babel/generator');
var fs = require('fs');
var less = require('less');
var postcss = require('postcss');
var postcssModules = require('postcss-modules');
var types = require('@babel/types');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n["default"] = e;
    return Object.freeze(n);
}

var parser__namespace = /*#__PURE__*/_interopNamespace(parser);
var traverse__default = /*#__PURE__*/_interopDefaultLegacy(traverse);
var generator__default = /*#__PURE__*/_interopDefaultLegacy(generator);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var less__default = /*#__PURE__*/_interopDefaultLegacy(less);
var postcss__default = /*#__PURE__*/_interopDefaultLegacy(postcss);
var postcssModules__default = /*#__PURE__*/_interopDefaultLegacy(postcssModules);

function findAndHotUpdateJS(ctx, update) {
    ctx.modules.forEach(module => {
        if (/(.jsx?|.tsx?)$/.test(module.url)) {
            update.push({
                type: `js-update`,
                timestamp: new Date().getTime(),
                path: module.url,
                acceptedPath: module.url,
            });
        } else {
            module.importers.forEach(moduleNode => {
                if (/(.jsx?|.tsx?)$/.test(moduleNode.url)) {
                    update.push({
                        type: `js-update`,
                        timestamp: new Date().getTime(),
                        path: moduleNode.url,
                        acceptedPath: moduleNode.url,
                    });
                } else {
                    findAndHotUpdateJS(ctx, update);
                }
            });
        }
    });

}

function Plugin() {
    const fileRegex = /\.less/;
    let cssModuleMap = [];
    let config = null;

    return {
        name: 'vite-plugin-less-2cssmodule',
        enforce: 'post',
        configResolved(resolvedConfig) {
            config = resolvedConfig;
        },
        async load(id) {
            if (!id.includes(".module.less") && fileRegex.test(id)) {
                //获取文件真实地址 打包过程less文件地址为 /xxx/index.less?used
                const realPath = id.replaceAll('?used', '');
                const lessCode = fs__default["default"].readFileSync(realPath, 'utf-8');
                const filePath = id.match(/src\/.*\//g)[0];

                let lessOptions = {
                    rewriteUrls: "local",
                    javascriptEnabled: true,
                    paths: [filePath],
                    math: "always"
                };
                //开发环境less配置
                if (config.command === "serve") {
                    lessOptions.rootpath = filePath;
                }
                //生产环境less配置
                if (config.command === "build") {
                    lessOptions.env = "production";
                }

                const { css } = await less__default["default"].render(lessCode, lessOptions);

                const cssModule = await postcss__default["default"]([postcssModules__default["default"]({
                    ...config.css.module,
                    getJSON: () => { }
                })]).process(css, { from: realPath });
                cssModuleMap[id] = {
                    exportTokens: cssModule.messages[0].exportTokens,
                    css: cssModule.css,
                };
                return cssModule.css;
            }
        },
        transform(code, id) {
            if (!id.includes(".module.less") && fileRegex.test(id)) {
                const { exportTokens, css } = cssModuleMap[id];

                const ast = parser__namespace.parse(code, {
                    sourceType: "module",
                    plugins: ['jsx'],
                });

                let babelObjectArray = [];
                for (let key in exportTokens) {
                    babelObjectArray.push(types.objectProperty(types.identifier(`"${key}"`), types.stringLiteral(exportTokens[key])));
                }

                traverse__default["default"](ast, {
                    VariableDeclarator(path) {
                        if (path.node.id.name === "__vite__css") {
                            path.node.init.value = css;
                        }
                    },
                    ExportDefaultDeclaration(path) {
                        path.node.declaration.type = "ObjectExpression";
                        path.node.declaration.properties = babelObjectArray;
                    },
                });

                const output = generator__default["default"](ast);
                return {
                    code: output.code,
                    map: null,
                }
            }
        },
        handleHotUpdate(ctx) {
            if (!ctx.file.includes(".module.less") && fileRegex.test(ctx.file)) {
                let update = [];
                findAndHotUpdateJS(ctx, update);
                ctx.server.ws.send({
                    type: "update",
                    updates: update
                });
                return ctx.modules;
            }
        }
    }
}

module.exports = Plugin;
