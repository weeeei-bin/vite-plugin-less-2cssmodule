# vite-plugin-less-2cssmodule
可以在vite中使用*.less启用CSS Module功能

## 使用

安装
```
npm install vite-plugin-less-2cssmodule
```

```
yarn add vite-plugin-less-2cssmodule
```

配置
> css.modules 会传入到 postcss-modules 的配置项

vite.config.js
```
import vitePluginLess2CssModule from 'vite-plugin-less-2cssmodule'

export default defineConfig({
    plugins: [...,vitePluginLess2CssModule()],
    css:{
        modules:{
            generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
    },
})
```
