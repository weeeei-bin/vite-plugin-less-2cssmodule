import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generator from "@babel/generator";
import fs from 'fs';
import less from 'less';
import postcss from 'postcss';
import postcssModules from 'postcss-modules';
import { objectProperty, identifier, stringLiteral } from '@babel/types';

function findAndHotUpdateJS(ctx, update) {
    ctx.modules.forEach(module => {
        if (/(.jsx?|.tsx?)$/.test(module.url)) {
            update.push({
                type: `js-update`,
                timestamp: new Date().getTime(),
                path: module.url,
                acceptedPath: module.url,
            })
        } else {
            module.importers.forEach(moduleNode => {
                if (/(.jsx?|.tsx?)$/.test(moduleNode.url)) {
                    update.push({
                        type: `js-update`,
                        timestamp: new Date().getTime(),
                        path: moduleNode.url,
                        acceptedPath: moduleNode.url,
                    })
                } else {
                    findAndHotUpdateJS(ctx, update)
                }
            })
        }
    });

}

function Plugin() {
    const fileRegex = /\.less/
    let cssModuleMap = [];
    let config = null;

    return {
        name: 'vite-plugin-less-2cssmodule',
        enforce: 'post',
        configResolved(resolvedConfig) {
            config = resolvedConfig
        },
        async load(id) {
            if (!id.includes(".module.less") && fileRegex.test(id)) {
                //获取文件真实地址 打包过程less文件地址为 /xxx/index.less?used
                const realPath = id.replaceAll('?used', '');
                const lessCode = fs.readFileSync(realPath, 'utf-8');
                const filePath = id.match(/src\/.*\//g)[0];

                let lessOptions = {
                    rewriteUrls: "local",
                    javascriptEnabled: true,
                    paths: [filePath],
                    math: "always"
                }
                //开发环境less配置
                if (config.command === "serve") {
                    lessOptions.rootpath = filePath;
                }
                //生产环境less配置
                if (config.command === "build") {
                    lessOptions.env = "production";
                }

                const { css } = await less.render(lessCode, lessOptions);

                const cssModule = await postcss([postcssModules({
                    ...config.css.module,
                    getJSON: () => { }
                })]).process(css, { from: realPath });
                cssModuleMap[id] = {
                    exportTokens: cssModule.messages[0].exportTokens,
                    css: cssModule.css,
                }
                return cssModule.css;
            }
        },
        transform(code, id) {
            if (!id.includes(".module.less") && fileRegex.test(id)) {
                const { exportTokens, css } = cssModuleMap[id];

                const ast = parser.parse(code, {
                    sourceType: "module",
                    plugins: ['jsx'],
                });

                let babelObjectArray = [];
                for (let key in exportTokens) {
                    babelObjectArray.push(objectProperty(identifier(`"${key}"`), stringLiteral(exportTokens[key])))
                }

                traverse(ast, {
                    VariableDeclarator(path) {
                        if (path.node.id.name === "__vite__css") {
                            path.node.init.value = css
                        }
                    },
                    ExportDefaultDeclaration(path) {
                        path.node.declaration.type = "ObjectExpression"
                        path.node.declaration.properties = babelObjectArray
                    },
                });

                const output = generator(ast);
                return {
                    code: output.code,
                    map: null,
                }
            }
        },
        handleHotUpdate(ctx) {
            if (!ctx.file.includes(".module.less") && fileRegex.test(ctx.file)) {
                let update = []
                findAndHotUpdateJS(ctx, update);
                ctx.server.ws.send({
                    type: "update",
                    updates: update
                })
                return ctx.modules;
            }
        }
    }
}

export default Plugin