#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const rl = createInterface({ input, output });

function runCapture(command, args) {
	const result = spawnSync(command, args, {
		cwd: ROOT_DIR,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	return {
		ok: result.status === 0,
		status: result.status ?? 1,
		stdout: result.stdout?.trim() ?? "",
		stderr: result.stderr?.trim() ?? "",
	};
}

function runInherit(command, args) {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: ROOT_DIR,
			stdio: "inherit",
		});

		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}

function getCurrentBranch() {
	const result = runCapture("git", ["branch", "--show-current"]);
	return result.stdout || "unknown";
}

function getGitStatus() {
	return runCapture("git", ["status", "--short", "--branch"]).stdout;
}

function hasStagedChanges() {
	const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
		cwd: ROOT_DIR,
		stdio: "ignore",
	});
	return result.status === 1;
}

function getRemoteUrl() {
	const result = runCapture("git", ["remote", "get-url", "origin"]);
	return result.ok ? result.stdout : "未设置";
}

function getDefaultCommitMessage() {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	const hh = String(now.getHours()).padStart(2, "0");
	const min = String(now.getMinutes()).padStart(2, "0");
	return `publish: ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

async function ask(question) {
	const answer = await rl.question(question);
	return answer.trim();
}

async function pause() {
	await rl.question("\n按回车继续...");
}

async function confirm(question, defaultYes = true) {
	const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
	const answer = (await ask(`${question}${suffix}`)).toLowerCase();

	if (!answer) return defaultYes;
	return answer === "y" || answer === "yes";
}

function printMenu() {
	const branch = getCurrentBranch();
	const remote = getRemoteUrl();

	console.log("\n==============================");
	console.log(" Firefly 博客终端菜单");
	console.log("==============================");
	console.log(`当前分支: ${branch}`);
	console.log(`远端仓库: ${remote}`);
	console.log("发布方式: push 到 master/main 后自动触发 GitHub Actions");
	console.log("");
	console.log("1. 新建文章");
	console.log("2. 启动本地开发");
	console.log("3. 本地构建");
	console.log("4. 查看 Git 状态");
	console.log("5. 一键发布博客");
	console.log("0. 退出");
	console.log("");
}

async function createPost() {
	const fileName = await ask("请输入文章路径或文件名，例如 manual/新文章.md: ");
	if (!fileName) {
		console.log("已取消创建文章。");
		return;
	}

	const exitCode = await runInherit("node", ["scripts/new-post.js", fileName]);
	if (exitCode === 0) {
		console.log("文章模板已创建。");
	}
}

async function startDevServer() {
	console.log("开发服务器已启动，按 Ctrl+C 可退出并回到菜单。\n");
	await runInherit(PNPM_BIN, ["dev"]);
}

async function buildSite() {
	console.log("开始本地构建...\n");
	const exitCode = await runInherit(PNPM_BIN, ["build"]);
	if (exitCode === 0) {
		console.log("\n构建完成。");
	}
}

async function showGitStatus() {
	const status = getGitStatus();
	console.log("");
	console.log(status || "工作区干净，没有未提交变更。");
}

async function publishSite() {
	const branch = getCurrentBranch();
	const status = getGitStatus();

	console.log("\n将执行以下流程：");
	console.log("1. pnpm build");
	console.log("2. git add -A");
	console.log("3. git commit -m <message>");
	console.log(`4. git push origin ${branch}`);
	console.log("");
	console.log("当前 Git 状态：");
	console.log(status || "工作区干净，没有未提交变更。");
	console.log("");

	if (!["master", "main"].includes(branch)) {
		console.log(
			`提示：当前分支是 ${branch}，推送后不一定会触发线上部署工作流。`,
		);
	}

	const shouldContinue = await confirm(`确认发布到 origin/${branch} 吗？`);
	if (!shouldContinue) {
		console.log("已取消发布。");
		return;
	}

	console.log("\n[1/4] 本地构建中...\n");
	const buildExitCode = await runInherit(PNPM_BIN, ["build"]);
	if (buildExitCode !== 0) {
		console.log("\n构建失败，已中止发布。");
		return;
	}

	console.log("\n[2/4] 暂存变更...\n");
	const addExitCode = await runInherit("git", ["add", "-A"]);
	if (addExitCode !== 0) {
		console.log("\n暂存失败，已中止发布。");
		return;
	}

	if (!hasStagedChanges()) {
		console.log("没有新的变更可提交。");
		const pushOnly = await confirm(`是否仍然执行 git push origin ${branch}？`, false);
		if (!pushOnly) {
			console.log("已取消发布。");
			return;
		}
	} else {
		const defaultMessage = getDefaultCommitMessage();
		const commitMessage =
			(await ask(`请输入提交说明（默认：${defaultMessage}）： `)) || defaultMessage;

		console.log("\n[3/4] 提交变更...\n");
		const commitExitCode = await runInherit("git", ["commit", "-m", commitMessage]);
		if (commitExitCode !== 0) {
			console.log("\n提交失败，已中止发布。");
			return;
		}
	}

	console.log(`\n[4/4] 推送到 origin/${branch}...\n`);
	const pushExitCode = await runInherit("git", ["push", "origin", branch]);
	if (pushExitCode !== 0) {
		console.log("\n推送失败，请检查远端分支状态后重试。");
		return;
	}

	console.log(
		"\n发布完成。GitHub Actions 会在远端收到 push 后自动构建并部署博客。",
	);
}

async function main() {
	while (true) {
		printMenu();
		const choice = await ask("请选择操作: ");

		if (choice === "0") break;
		if (choice === "1") await createPost();
		else if (choice === "2") await startDevServer();
		else if (choice === "3") await buildSite();
		else if (choice === "4") await showGitStatus();
		else if (choice === "5") await publishSite();
		else console.log("无效选项，请重新输入。");

		await pause();
	}

	await rl.close();
}

main().catch(async (error) => {
	console.error("\n菜单运行失败：", error);
	await rl.close();
	process.exit(1);
});
