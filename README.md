# ☁️ TeleCloud 私人云存储

> 基于 **Cloudflare Pages** + **Telegram** 构建的完全免费私人云存储系统。
> 无需服务器、无需花钱、数据存储无上限。

---

## 📌 目录

- [效果预览](#效果预览)
- [功能清单](#功能清单)
- [免费额度说明](#免费额度说明)
- [部署前准备](#部署前准备)
  - [第一步：注册 GitHub 账号](#第一步注册-github-账号)
  - [第二步：Fork 本仓库](#第二步fork-本仓库)
  - [第三步：注册 Cloudflare 账号](#第三步注册-cloudflare-账号)
  - [第四步：创建 Telegram Bot](#第四步创建-telegram-bot)
  - [第五步：创建 Telegram 私有频道](#第五步创建-telegram-私有频道)
  - [第六步：获取频道 ID](#第六步获取频道-id)
  - [第七步：将 Bot 添加为频道管理员](#第七步将-bot-添加为频道管理员)
  - [第八步：创建 Cloudflare KV 数据库](#第八步创建-cloudflare-kv-数据库)
- [正式部署](#正式部署)
  - [第九步：创建 Cloudflare Pages 项目](#第九步创建-cloudflare-pages-项目)
  - [第十步：绑定 KV 命名空间](#第十步绑定-kv-命名空间)
  - [第十一步：配置环境变量](#第十一步配置环境变量)
  - [第十二步：触发重新部署](#第十二步触发重新部署)
- [首次使用](#首次使用)
- [挂载到本地](#挂载到本地)
  - [Alist 挂载](#alist-挂载)
  - [Rclone 挂载](#rclone-挂载)
  - [Windows 直接挂载](#windows-直接挂载)
  - [macOS 直接挂载](#macos-直接挂载)
- [常见问题排查](#常见问题排查)
- [注意事项与限制](#注意事项与限制)

---

## 效果预览

```
登录页  →  文件管理主界面  →  管理后台
  ↓              ↓                ↓
密码验证    上传/下载/移动      系统设置
           新建/删除文件夹      WebDAV配置
           远程URL上传          统计信息
           磁力/种子提交
```

---

## 功能清单

| 功能 | 说明 |
|------|------|
| 🔐 登录保护 | 账号+密码验证，未登录无法访问任何内容 |
| 📦 大文件上传 | 自动分块（每块19MB），支持单文件最大 **10GB** |
| 📁 文件夹管理 | 新建、删除、重命名文件夹 |
| 🗂️ 文件管理 | 单个/批量 移动、删除文件 |
| ⬆️ 本地上传 | 支持拖拽上传，多文件同时上传 |
| 🔗 远程URL上传 | 粘贴网络链接直接抓取保存 |
| 🧲 磁力链接 | 提交磁力链接，配合外部工具下载 |
| 📄 种子文件 | 上传 .torrent 文件并保存 |
| 🔌 WebDAV协议 | 支持挂载到 Alist / Rclone / Windows / macOS |
| ⚙️ 管理后台 | 修改密码、配置存储、查看统计 |
| 🌙 多主题 | 深色 / 浅色 / 海洋 三种界面主题 |

---

## 免费额度说明

部署本项目使用的全部都是免费服务，无需绑定信用卡：

| 服务 | 免费内容 | 是否够用 |
|------|----------|----------|
| **Cloudflare Pages** | 无限静态页面托管 | ✅ 完全够用 |
| **Cloudflare Workers** | 每天 10万次函数请求 | ✅ 个人使用足够 |
| **Cloudflare KV** | 读10万次/天，写1000次/天，存储1GB | ✅ 存元数据足够 |
| **Telegram 频道** | 无限文件存储空间 | ✅ 理论上无上限 |
| **GitHub** | 免费公开/私有仓库 | ✅ 完全免费 |

> 💡 **核心原理**：文件实际保存在 Telegram 私有频道中（Telegram 提供免费无限存储），
> Cloudflare 只负责提供网页界面和 API 接口，KV 只保存文件名、大小等元数据信息，不保存文件本身。

---

## 部署前准备

> ⏱️ 预计准备时间：**30-45 分钟**（全程图文指引）
> 
> 🛠️ 所需工具：一台电脑 + 浏览器 + 手机（用于 Telegram）

---

### 第一步：注册 GitHub 账号

如果你已有 GitHub 账号，**跳过此步骤**。

1. 打开浏览器，访问 [https://github.com](https://github.com)
2. 点击右上角 **Sign up**（注册）按钮
3. 按提示输入：
   - 邮箱地址
   - 密码（至少8位，包含数字和字母）
   - 用户名（英文，全站唯一）
4. 完成邮箱验证
5. 选择免费计划（**Free**），点击继续

> ✅ 注册成功后你会看到 GitHub 主页界面

---

### 第二步：Fork 本仓库

**"Fork"的意思是：把本项目的代码复制一份到你自己的 GitHub 账号下。**

1. 登录 GitHub 后，访问本项目的仓库页面
2. 点击页面右上角的 **Fork** 按钮
3. 在弹出窗口中，**Repository name（仓库名）** 保持默认即可
4. 点击 **Create fork** 按钮
5. 等待几秒钟，页面会跳转到你自己账号下的仓库副本

> ✅ 成功后，你的仓库地址格式为：
> `https://github.com/你的用户名/telecloud`

---

### 第三步：注册 Cloudflare 账号

如果你已有 Cloudflare 账号，**跳过此步骤**。

1. 访问 [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. 输入邮箱和密码，点击 **Create Account**
3. 查收邮件，点击验证链接完成注册
4. 登录后会进入 Cloudflare 控制台主页

> ✅ 看到 Cloudflare 控制台即为成功，**无需**添加任何域名

---

### 第四步：创建 Telegram Bot

**Bot（机器人）是用来帮你把文件自动发送到 Telegram 频道的工具。**

#### 4.1 在手机 Telegram 中操作

1. 打开 Telegram 手机 App
2. 点击右上角搜索图标（🔍）
3. 搜索 **@BotFather**（注意：必须是蓝色官方认证的那个，有蓝色对勾）
4. 点击进入与 BotFather 的对话
5. 点击底部 **START** 按钮（或发送 `/start`）

#### 4.2 创建新 Bot

6. 发送命令：`/newbot`
7. BotFather 会问你：**What would you like to name it?**（给 Bot 起个名字）
   - 随意输入一个名称，例如：`My Cloud Storage`
8. 接着问：**Choose a username**（用户名，必须以 `bot` 结尾）
   - 例如：`mycloud2025bot` 或 `yourname_storage_bot`
   - 如果提示"This username is already taken"，换一个再试

9. 创建成功！BotFather 会发给你一条消息，其中包含：
   ```
   Use this token to access the HTTP API:
   7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   
   **这一长串就是你的 `Bot Token`，请复制并安全保存！**

> ⚠️ **重要**：Bot Token 相当于密码，不要分享给任何人。

---

### 第五步：创建 Telegram 私有频道

**频道是用来存储你的文件的地方，必须设为私有（其他人无法搜索到）。**

1. 打开 Telegram，点击左上角菜单（≡）或直接点击新建图标
2. 选择 **New Channel**（新建频道）
3. 填写频道名称，例如：`My Private Storage`（名称随意，不对外公开）
4. 点击下一步
5. 频道类型选择 **Private**（私有）⬅️ 这一步很重要！
6. 点击创建，不需要邀请任何联系人，直接跳过

> ✅ 频道创建成功后，你会进入这个频道的页面

---

### 第六步：获取频道 ID

**频道 ID 是一串数字，格式通常为 `-100xxxxxxxxxx`，用于告诉 Bot 把文件发到哪个频道。**

#### 方法一：通过 Telegram Web（推荐）

1. 电脑浏览器打开 [https://web.telegram.org/k/](https://web.telegram.org/k/)
2. 登录你的 Telegram 账号
3. 在左侧列表中找到你刚创建的频道，点击进入
4. 查看浏览器地址栏，URL 格式为：
   ```
   https://web.telegram.org/k/#-1001234567890
   ```
5. `#` 后面的数字（包含负号和100开头）就是频道 ID
   - 例如：`-1001234567890`

#### 方法二：通过 @userinfobot

1. 在 Telegram 中搜索 `@userinfobot`，进入对话
2. 将你的频道的邀请链接或频道用户名转发给它
3. 它会回复频道的 ID

> 📝 **记录你的频道 ID**，格式通常是 `-100` 开头的一串数字

---

### 第七步：将 Bot 添加为频道管理员

**Bot 需要有发送消息的权限，才能把文件存入频道。**

1. 打开你创建的私有频道
2. 点击频道顶部名称，进入频道信息页
3. 找到 **Administrators**（管理员）或 **Edit** → **Administrators**
4. 点击 **Add Administrator**（添加管理员）
5. 搜索你的 Bot 用户名（就是刚才创建时设置的，以 `bot` 结尾）
6. 选择 Bot 后，在权限设置中，确保以下权限是开启的：
   - ✅ **Post Messages**（发送消息）
   - ✅ **Delete Messages**（可选，建议开启）
   - ✅ **Edit Messages**（可选）
7. 点击 **Save**（保存）

> ✅ 完成后，Bot 就有权限向频道发送文件了

---

### 第八步：创建 Cloudflare KV 数据库

**KV 是 Cloudflare 提供的键值数据库，用来保存文件名、大小等元数据（不存文件本身）。**

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)
2. 在左侧菜单找到 **Workers 和 Pages**（Workers & Pages）
3. 点击展开，找到并点击 **KV**
4. 点击右上角 **创建命名空间**（Create a namespace）按钮
5. 在 **命名空间名称** 输入框中填写：`TC_KV`
   （名字必须与代码匹配，请原样输入 `TC_KV`）
6. 点击 **添加**（Add）按钮

> ✅ 创建成功后，列表中会出现 `TC_KV`，旁边有一串字母数字组成的 **ID**
>
> 📝 **请记录这个 ID**，后面绑定时会用到（格式类似：`a1b2c3d4e5f6...`）

---

## 正式部署

---

### 第九步：创建 Cloudflare Pages 项目

1. 在 Cloudflare 控制台左侧，点击 **Workers 和 Pages**
2. 点击 **Pages** 标签
3. 点击 **连接到 Git**（Connect to Git）按钮
4. 选择 **GitHub**，点击 **连接 GitHub 账号**
5. 在弹出的 GitHub 授权窗口中，点击 **Authorize Cloudflare Pages**
6. 回到 Cloudflare 页面，在仓库列表中找到你 Fork 的 `telecloud` 仓库
7. 点击仓库旁边的 **选择**（Select）按钮
8. 进入 **构建和部署设置** 页面，填写如下：

   | 配置项 | 填写内容 |
   |--------|----------|
   | 项目名称 | `telecloud`（或你喜欢的英文名） |
   | 生产分支 | `main` |
   | 框架预设 | **无（None）** |
   | 构建命令 | `npm install` |
   | 构建输出目录 | `public` |

9. 点击 **保存并部署**（Save and Deploy）按钮
10. 等待约 1-3 分钟，页面会显示构建进度

> ✅ 部署完成后，你会得到一个类似以下格式的网址：
> `https://telecloud.pages.dev`（或 `https://你的项目名.pages.dev`）

> ⚠️ **此时先不要访问**，因为还没有配置环境变量，访问会出错。继续下面的步骤。

---

### 第十步：绑定 KV 命名空间

**这一步是告诉 Cloudflare Pages 项目，使用哪个 KV 数据库来存储元数据。**

1. 在 Cloudflare Pages 项目页面中，点击顶部的 **设置**（Settings）标签
2. 在左侧找到 **函数**（Functions）
3. 向下滚动找到 **KV 命名空间绑定**（KV namespace bindings）
4. 点击 **添加绑定**（Add binding）
5. 填写：
   - **变量名称**：填写 `TC_KV`（必须完全一致，区分大小写）
   - **KV 命名空间**：从下拉菜单选择你在第八步创建的 `TC_KV`
6. 点击 **保存**（Save）

> ✅ 绑定成功后，列表中会显示 `TC_KV` 的绑定记录

---

### 第十一步：配置环境变量

**环境变量是用来安全存储密码、Token 等敏感信息的，不会暴露在代码中。**

1. 在 Pages 项目的 **设置** 页面，左侧找到 **环境变量**（Environment variables）
2. 点击 **添加变量**（Add variable）
3. 依次添加以下 **5 个变量**（每添加一个点一次保存，或全部填完后统一保存）：

---

#### 变量一：管理员用户名

| 项目 | 内容 |
|------|------|
| 变量名 | `ADMIN_USERNAME` |
| 值 | 你想要设置的用户名，例如 `admin` 或 `yourname` |
| 是否加密 | 否（普通文本即可） |

---

#### 变量二：管理员密码

| 项目 | 内容 |
|------|------|
| 变量名 | `ADMIN_PASSWORD` |
| 值 | 你想要设置的密码，**建议设置强密码**，例如 `MyCloud@2025!` |
| 是否加密 | ✅ **建议勾选"加密"（Encrypt）**，密码会被隐藏 |

---

#### 变量三：上传专用密码（可选）

| 项目 | 内容 |
|------|------|
| 变量名 | `UPLOAD_PASSWORD` |
| 值 | 一个独立的上传密码，使用账号 `upload` + 此密码可只上传不管理 |
| 是否加密 | ✅ 建议加密 |

> 💡 如果不需要区分权限，可以跳过此变量，或填写与管理员密码相同的值

---

#### 变量四：Telegram Bot Token

| 项目 | 内容 |
|------|------|
| 变量名 | `TG_BOT_TOKEN` |
| 值 | 第四步从 BotFather 获取的 Token，例如 `7123456789:AAHxxxxxxx...` |
| 是否加密 | ✅ **必须加密**，Token 泄露会导致他人控制你的 Bot |

---

#### 变量五：Telegram 频道 ID

| 项目 | 内容 |
|------|------|
| 变量名 | `TG_CHANNEL_ID` |
| 值 | 第六步获取的频道 ID，例如 `-1001234567890` |
| 是否加密 | 否（普通文本即可） |

---

4. 所有变量添加完成后，确认列表中有以下 5 行（UPLOAD_PASSWORD 可选）：

```
ADMIN_USERNAME      = 你设置的用户名
ADMIN_PASSWORD      = ******（已加密）
UPLOAD_PASSWORD     = ******（已加密，可选）
TG_BOT_TOKEN        = ******（已加密）
TG_CHANNEL_ID       = -100xxxxxxxxxx
```

5. 点击页面底部 **保存**（Save）按钮

> ✅ 环境变量配置完成

---

### 第十二步：触发重新部署

**修改环境变量后，需要重新部署才能生效。**

1. 在 Pages 项目页面，点击顶部 **部署**（Deployments）标签
2. 找到最近一次部署记录，点击右侧的 **...** 菜单
3. 点击 **重试部署**（Retry deployment）
   
   **或者**：
   
   - 回到你在 GitHub 的仓库
   - 对任意文件做一个小修改（例如在 README.md 末尾添加一个空行）
   - 提交（Commit）这个修改
   - Cloudflare Pages 会自动检测到 GitHub 的更新并重新部署

4. 等待 1-3 分钟，看到 **成功**（Success）的绿色标志即完成

---

## 首次使用

### 访问你的云存储

1. 在 Cloudflare Pages 项目页面，找到你的网址（格式为 `https://你的项目名.pages.dev`）
2. 点击网址，浏览器会自动跳转到 **登录页面**
3. 输入你在第十一步设置的：
   - **用户名**：`ADMIN_USERNAME` 的值
   - **密码**：`ADMIN_PASSWORD` 的值
4. 点击 **登录**，成功后进入文件管理主界面

### 测试上传

1. 点击界面顶部的 **⬆️ 上传文件** 按钮
2. 选择一个小文件（例如一张图片）进行测试
3. 如果上传成功，文件会出现在列表中，说明一切配置正常

### 进入管理后台

1. 主界面左下角点击 **⚙️ 管理后台** 按钮（管理员账号登录才显示）
2. 在管理后台可以：
   - **存储渠道**：再次确认 Telegram Bot Token 和频道 ID 是否正确，点击"测试连接"
   - **安全设置**：修改管理员密码
   - **外观设置**：切换界面主题
   - **WebDAV 挂载**：查看挂载地址和说明

---

## 挂载到本地

通过 WebDAV 协议，你可以把 TeleCloud 当作本地磁盘使用，在资源管理器中直接拖拽文件。

> 📋 **你的 WebDAV 连接信息**（请按实际情况替换）：
>
> | 项目 | 内容 |
> |------|------|
> | 服务器地址 | `https://你的项目名.pages.dev/api/webdav/` |
> | 用户名 | 你设置的 `ADMIN_USERNAME` |
> | 密码 | 你设置的 `ADMIN_PASSWORD` |

---

### Alist 挂载

[Alist](https://github.com/alist-org/alist) 是一个功能强大的多网盘管理工具，推荐使用。

#### 安装 Alist（Windows）

1. 访问 [Alist Releases 页面](https://github.com/alist-org/alist/releases)
2. 下载最新版 `alist-windows-amd64.zip`
3. 解压到任意文件夹，例如 `C:\alist\`
4. 双击 `alist.exe` 运行
5. 首次运行会输出一个初始密码，例如：
   ```
   Initial password: admin123456
   ```
6. 打开浏览器，访问 `http://localhost:5244`
7. 用户名 `admin`，密码使用上面输出的初始密码登录

#### 在 Alist 中添加 TeleCloud 存储

1. 登录 Alist 管理后台后，左侧菜单点击 **存储**
2. 点击 **添加** 按钮
3. 填写如下信息：

   | 字段 | 填写内容 |
   |------|----------|
   | 挂载路径 | `/telecloud`（或你喜欢的名字） |
   | 存储策略 | 选择 **WebDAV** |
   | 服务器地址 | `https://你的项目名.pages.dev/api/webdav/` |
   | 用户名 | 你的管理员用户名 |
   | 密码 | 你的管理员密码 |
   | WebDAV 供应商 | 选择 **Other** |
   | 根文件夹路径 | `/` |

4. 点击 **保存**
5. 回到 Alist 主页，左侧会出现 `telecloud` 目录，点击即可浏览和管理文件

---

### Rclone 挂载

[Rclone](https://rclone.org) 是一个命令行工具，可以将 WebDAV 挂载为本地磁盘。

#### 安装 Rclone

- **Windows**：下载 [rclone-windows-amd64.zip](https://rclone.org/downloads/)，解压后将 `rclone.exe` 放入 `C:\Windows\System32\`
- **macOS**：终端运行 `brew install rclone`
- **Linux**：终端运行 `curl https://rclone.org/install.sh | bash`

#### 配置 Rclone

1. 打开终端（Windows 用 PowerShell 或 CMD）
2. 运行配置命令：
   ```bash
   rclone config
   ```
3. 依次选择/输入：
   - `n`（新建配置）
   - 名称：`telecloud`
   - 类型：输入 `webdav` 并按回车
   - URL：`https://你的项目名.pages.dev/api/webdav/`
   - Vendor：输入 `other`
   - User：你的管理员用户名
   - Password：输入 `y` 然后输入密码
   - 其余选项直接回车跳过
   - 最后输入 `q` 退出配置

#### 挂载为本地磁盘

**Windows（将 TeleCloud 挂载为 T: 盘）：**
```powershell
rclone mount telecloud:/ T: --vfs-cache-mode full --daemon
```

**macOS / Linux（挂载到 ~/telecloud 目录）：**
```bash
mkdir ~/telecloud
rclone mount telecloud:/ ~/telecloud --vfs-cache-mode full --daemon
```

> 💡 `--vfs-cache-mode full` 参数可提升大文件读写性能

---

### Windows 直接挂载

Windows 10 / 11 原生支持 WebDAV，无需安装任何软件。

> ⚠️ **注意**：Windows 原生 WebDAV 仅支持 HTTP，对 HTTPS 有限制，
> 如遇到连接失败，建议优先使用 Rclone 或 Alist 方案。

1. 打开 **文件资源管理器**（此电脑）
2. 点击顶部 **计算机** → **映射网络驱动器**
3. 选择一个驱动器字母（如 `Z:`）
4. 文件夹中填写：
   ```
   https://你的项目名.pages.dev/api/webdav/
   ```
5. 勾选 **使用其他凭据连接**
6. 点击完成，输入用户名和密码
7. 挂载成功后，**此电脑** 中会出现新的网络驱动器

---

### macOS 直接挂载

macOS 的 Finder 原生支持 WebDAV。

1. 打开 **Finder**
2. 顶部菜单点击 **前往** → **连接服务器**（快捷键 `⌘ + K`）
3. 在地址栏输入：
   ```
   https://你的项目名.pages.dev/api/webdav/
   ```
4. 点击 **连接**
5. 在弹出窗口选择 **注册用户**
6. 输入用户名和密码
7. 点击 **连接**，成功后 Finder 左侧会出现 TeleCloud 挂载点

---

## 常见问题排查

### ❓ 问题一：访问网址后显示 "404 Not Found"

**原因**：构建配置有误，静态文件未正确部署。

**解决方法**：
1. 进入 Cloudflare Pages 项目 → **设置** → **构建**
2. 确认 **构建输出目录** 是否填写的是 `public`（不是 `dist` 或其他）
3. 重新触发部署

---

### ❓ 问题二：登录后提示 "Unauthorized" 或一直跳回登录页

**原因**：KV 绑定失败或环境变量未生效。

**解决方法**：
1. 检查 **KV 命名空间绑定** 中变量名是否为 `TC_KV`（区分大小写）
2. 检查环境变量 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 是否已保存
3. 确保在修改设置后执行了 **重新部署**（重新部署后环境变量才会生效）

---

### ❓ 问题三：上传文件后文件不显示 / 上传失败

**原因**：Telegram Bot Token 或频道 ID 配置有误。

**解决方法**：
1. 登录管理后台 → **存储渠道**，点击 **测试连接**
2. 如果提示错误，检查 `TG_BOT_TOKEN` 是否完整复制（包含冒号前后的部分）
3. 检查 `TG_CHANNEL_ID` 是否是 `-100` 开头的完整数字
4. 确认 Bot 已经被添加为频道管理员（第七步）

---

### ❓ 问题四：上传大文件时进度条卡住或报错

**原因**：Cloudflare Workers 免费版单次请求最长执行时间为 **30秒**，超大文件的单个分块上传可能超时。

**解决方法**：
- 分块上传是自动的（每块 19MB），通常 30 秒内可完成一块
- 如遇网络较慢导致超时，可尝试在网络较好的环境下上传
- 建议单次上传文件不超过 **5GB**，以保证稳定性

---

### ❓ 问题五：WebDAV 无法连接

**解决方法**：
1. 确认地址末尾有斜杠 `/`：`/api/webdav/`
2. 用浏览器直接访问 `https://你的域名/api/webdav/`，如果弹出用户名密码框，说明服务正常
3. Windows 原生 WebDAV 对 HTTPS 支持有限，优先使用 Rclone 或 Alist

---

### ❓ 问题六：页面可以打开，但功能操作没有反应

**原因**：浏览器缓存问题，或者重新部署后旧版本 JS 未刷新。

**解决方法**：
- 按 `Ctrl + Shift + R`（Windows）或 `⌘ + Shift + R`（macOS）强制刷新浏览器缓存

---

### ❓ 问题七：忘记了管理员密码

**解决方法**：
1. 登录 Cloudflare Pages 控制台
2. 进入项目 → **设置** → **环境变量**
3. 找到 `ADMIN_PASSWORD`，点击编辑，修改为新密码
4. 保存后 **重新部署**
5. 用新密码登录，进入管理后台 → **安全设置** 可以再次修改

---

## 注意事项与限制

### ⚡ 性能限制

| 限制项 | 说明 |
|--------|------|
| 单块上传超时 | 每个 19MB 的分块需要在 30 秒内上传完，网速过慢可能失败 |
| 并发请求 | 同时上传多个大文件可能触发 Cloudflare 的速率限制 |
| 下载速度 | 受限于 Telegram 服务器出口速度，国内访问可能较慢 |

### 💾 存储限制

| 限制项 | 说明 |
|--------|------|
| Telegram 单文件 | Bot API 上传单个文件上限 20MB（本项目已自动分块绕过） |
| KV 存储上限 | 免费版 1GB（只存元数据，存几十万个文件没问题） |
| KV 写入次数 | 免费版每天 1000 次（每次上传消耗约 2-4 次写入） |

### 🔒 安全建议

- 设置**强密码**（至少12位，包含大小写字母、数字、符号）
- 不要将你的 Bot Token 分享给他人
- Telegram 频道设为**私有**（不对外公开）
- 定期在管理后台检查存储情况

### 🌐 磁力链接 / BT 下载说明

由于 Cloudflare Workers 是无服务器架构，**不支持持久 TCP 连接**，因此无法直接运行 BitTorrent 协议。

本项目对磁力链接的处理方式是：
1. 记录磁力链接任务到 KV 数据库
2. 尝试通过第三方 API 获取种子元数据
3. **最终下载**需要你使用 Alist + qBittorrent 等本地工具配合处理

> 💡 推荐工作流：TeleCloud 保存种子文件 → 通过 WebDAV 挂载读取 → 本地 qBittorrent 完成下载 → 下载完成后通过远程 URL 上传回 TeleCloud

---

## 项目结构说明

```
telecloud/
├── functions/              # Cloudflare Pages Functions（后端 API）
│   ├── _middleware.js      # 全局鉴权中间件
│   └── api/
│       ├── auth.js         # 登录 / 登出
│       ├── upload.js       # 分块上传到 Telegram
│       ├── download.js     # 从 Telegram 重组下载
│       ├── files.js        # 文件列表、批量删除
│       ├── folders.js      # 文件夹管理
│       ├── move.js         # 文件移动
│       ├── remote-upload.js # URL 远程下载
│       ├── torrent.js      # 磁力 / 种子处理
│       ├── settings.js     # 系统设置
│       └── webdav/         # WebDAV 协议实现
│           └── [[path]].js
└── public/                 # 前端静态文件
    ├── index.html          # 文件管理主界面
    ├── login.html          # 登录页面
    ├── admin.html          # 管理后台
    └── assets/
        ├── style.css       # 全局样式（含3套主题）
        ├── app.js          # 主界面交互逻辑
        └── admin.js        # 后台交互逻辑
```

---

## 更新升级

当本项目发布新版本时，你只需：

1. 打开你 Fork 的 GitHub 仓库
2. 点击 **Sync fork**（同步 Fork）按钮
3. 点击 **Update branch**（更新分支）
4. Cloudflare Pages 会自动检测到更新并重新部署

---

## License

MIT License — 免费使用，欢迎二次开发
