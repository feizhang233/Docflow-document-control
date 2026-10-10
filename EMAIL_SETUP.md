# DocFlow 发件邮箱设置说明

DocFlow 已有订阅、变更队列和邮件发送功能，但需要连接一个实际的 **SMTP 发件服务**。它负责将项目变更发给各账户保存的通知邮箱。

- **发件邮箱**：管理员在部署服务器上统一配置，所有账户和 Project 共用这一发送服务。
- **收件邮箱**：每个账户在左侧 **Notification → Email addresses** 中设置，最多 5 个不同地址，可分别订阅多个 Project。

添加收件邮箱不会自动设置发件邮箱。页面中的 **How to set up the sending mailbox** 可展开查看英文设置说明。

## 1. 准备发件账户

从邮箱服务商或公司邮件管理员取得以下信息：SMTP 服务器、端口、加密方式、登录账号、SMTP 密码或应用专用密码，以及允许使用的发件地址。

当前版本支持 SMTP 用户名和密码认证，以及可信内部服务器的免认证转发。若服务商只允许 OAuth 登录，当前版本不能直接连接，应使用公司批准的、兼容 SMTP 的邮件转发服务。SMTP 不需要配置收邮件的 POP/IMAP 服务。

### Gmail 示例

如果 Google 账户支持应用专用密码：

1. 在 Google 账户中启用 **2-Step Verification**。
2. 打开 [App passwords](https://myaccount.google.com/apppasswords)，为 DocFlow 创建一个应用专用密码。
3. 使用完整 Gmail 地址作为登录账号，并使用生成的应用专用密码。

应用专用密码可能因组织账户或账户安全策略而不可用；这时请向邮件管理员取得兼容的发送服务。修改 Google 账户密码后，旧应用专用密码会被撤销，需要重新生成并更新服务器配置。参见 [Google 官方说明](https://support.google.com/accounts/answer/185833?hl=en)。

以下示例采用 Gmail 的 `smtp.gmail.com`、端口 `587` 和 `starttls`，依据 [Gmail 官方 SMTP 设置](https://support.google.com/mail/answer/7104828?hl=en)。

## 2. 修改部署服务器的配置

对于仓库默认的 Docker Compose 部署，在**实际服务器上的项目目录**找到与 `docker-compose.yml` 同级的 `.env`，修改或加入以下字段。不要覆盖原有数据库密码、API 密钥等配置；`.env.example` 仅供参考，修改它不会改变正在运行的服务。

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=your-sending-account@gmail.com
SMTP_PASSWORD='replace_with_your_app_password'
SMTP_FROM_EMAIL=your-sending-account@gmail.com
SMTP_TIMEOUT_SECONDS=15
EMAIL_POLL_SECONDS=30
PUBLIC_APP_URL=https://your-docflow-site.com
```

将示例中的账号、密码和网站地址换成实际值。密码放在单引号内可避免 Docker Compose 将其中的 `$` 当作变量；密码本身若包含单引号，应按部署环境的规则转义。凭据仅保存在服务器配置中，不要提交到 GitHub，也不要填入 Notification 的收件邮箱表单。

| 配置项 | 填写内容 |
| --- | --- |
| `SMTP_HOST` | 服务商提供的发件服务器名称，不包含 `https://` |
| `SMTP_PORT` | 服务商要求的端口 |
| `SMTP_SECURITY` | `starttls` 通常配合 587；`ssl` 通常配合 465；以服务商要求为准。`plain` 仅用于可信内部转发服务 |
| `SMTP_USERNAME` | 发件账户的 SMTP 登录账号，可能是完整邮箱地址，也可能是服务商专门分配的账号 |
| `SMTP_PASSWORD` | SMTP 密码、授权码或应用专用密码，以服务商要求为准 |
| `SMTP_FROM_EMAIL` | 收件人看到的发件邮箱，必须是服务商允许该账号使用的地址 |
| `SMTP_TIMEOUT_SECONDS` | 单次连接超时，默认 15 秒 |
| `EMAIL_POLL_SECONDS` | 检查待发邮件的间隔，默认 30 秒 |
| `PUBLIC_APP_URL` | 用户实际访问的 DocFlow 网站地址，用于邮件中的文档链接；留空则不加入链接 |

其他邮箱服务商使用相同字段，替换服务器、账号和加密方式即可。公司转发服务器只有在明确允许免认证时才可留空 `SMTP_USERNAME` 和 `SMTP_PASSWORD`。

## 3. 让配置生效

在部署服务器的项目目录执行：

```bash
docker compose up -d --force-recreate backend
```

这会重新创建后端容器并载入新的配置，保留已有数据库卷。仅执行 `docker compose restart backend` 不会更新容器环境变量，参见 [Docker 官方说明](https://docs.docker.com/reference/cli/docker/compose/restart/)。重新创建的行为参见 [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)。

如果服务器还需要安装最新应用代码（包括新的页面说明），先更新代码，然后执行：

```bash
docker compose up -d --build
```

非 Docker 部署：将上述变量写入后端进程的服务配置，或后端工作目录的 `.env`，再重启该后端进程。修改本地电脑的 `.env` 不会改变远端服务器的发件配置。

## 4. 测试实际发送

1. 打开 **Notification → Email addresses**，先添加自己的收件邮箱。
2. 选择可以访问的 Project 和通知类型；测试评论通知时勾选 **Comments**，保持订阅 **Active**。
3. 用具有该 Project 编辑权限的账户修改一条文档，或通过现有同步功能同步一次实际的评论变更。仅查看账户可接收通知，但不能修改文档来触发测试。
4. 等待后台处理，默认每 30 秒检查一次队列；若已有积压或重试，可能需要更久。
5. 查看订阅中的 **Last email** 和自己的收件箱、垃圾邮件文件夹。

`Email delivery is not enabled yet` 提示消失，只说明已填写 `SMTP_HOST` 和 `SMTP_FROM_EMAIL`，不代表账号认证或网络连接已经通过。必须通过实际收到测试邮件确认发送成功。

`Last email: sent` 表示邮件服务器接受了邮件，不代表收件人已收到或阅读。邮件模板默认英语，文档内容和 comments 保持原文；评论变更包含之前和当前内容。

启用发送后，已有的有效待发队列会自动处理。订阅只记录添加之后的变更；暂停订阅会取消其待发邮件，恢复后只发送新的变更。

## 5. 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 仍显示未启用 | 确认修改的是实际部署目录的 `.env`，已填写服务器和发件地址，并重新创建后端容器；刷新页面 |
| 一直 queued 或发生连接错误 | 检查服务器域名、端口和加密方式；确认部署服务器允许连接服务商的 SMTP 端口，并且后端正常运行 |
| 认证失败 | 检查 SMTP 登录账号及密码；若服务商要求授权码或应用专用密码，使用对应凭据；确认该账户允许 SMTP 登录 |
| 发件地址被拒绝 | 将 `SMTP_FROM_EMAIL` 改为当前账号或服务商已批准的发送地址 |
| 没有产生邮件 | 确认 Project、通知类型及 Active 状态正确，账户仍有项目权限，并发生了真实变更；相同同步内容和行排序不会发送邮件 |
| sent 但收件箱没有 | 检查垃圾邮件、邮箱过滤规则及服务商投递记录；使用自有域名时按邮件服务商要求检查域名发送认证 |
| 修改配置后仍失败 | 重新创建后端，使新配置生效；系统会自动重试最多 5 次，最终 failed 后可点击订阅卡片中的 **Retry** |

排查服务器启动问题时可使用 `docker compose ps backend` 和 `docker compose logs --tail=100 backend`。页面会显示简化后的发送错误，不包含密码或服务商的完整响应。邮件发送失败不会撤销已保存的文档或评论变更。
