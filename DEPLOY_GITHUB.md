# GitHub 一键部署（Astro + Firefly）

当前仓库已包含 `.github/workflows/deploy.yml`，支持：

- 推送到 `master` 自动部署
- 在 GitHub `Actions` 页面手动点击 `Run workflow` 一键部署

## 首次使用需要设置

1. 打开仓库 `Settings -> Pages`
2. `Build and deployment` 选择 `Deploy from a branch`
3. Branch 选择 `pages`，目录选择 `/ (root)`
4. 保存

## 之后的发布方式

- 自动发布：`git push origin master`
- 终端菜单：`pnpm menu`，然后选择 `一键发布博客`
- 手动一键：`GitHub -> Actions -> Deploy to Pages Branch -> Run workflow`

构建产物目录为 `dist/`，工作流会自动部署到 `pages` 分支。
