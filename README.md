# 屏幕共享 + 双向语音通话（国内免费版，跨外网不卡）

> 技术栈：ASP.NET Core 8 SignalR（信令服务器）+ WebRTC（P2P 媒体）+ 网页客户端 / MAUI 安卓 APP
> 开发工具：Visual Studio 2022（.NET 8 工作负载）
> 国内免费部署：腾讯云 CloudBase 云托管（0 元/月）+ 国内 STUN 服务器
> 特点：信令走国内服务器，媒体走 P2P 直连，不卡、不耗服务器带宽；非局域网可用

---

## 一、项目结构

```
ScreenShareApp/
├── Dockerfile                  # 容器化部署（CloudBase 用）
├── SignalServer/               # 信令服务器 + 网页客户端
│   ├── Program.cs              # 服务启动 + SignalR 心跳配置
│   ├── Hubs/SignalHub.cs       # 信令 Hub（转发 SDP/ICE）
│   ├── SignalServer.csproj
│   ├── appsettings.json
│   └── wwwroot/                # 网页客户端（手机浏览器直接访问）
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js           # WebRTC 核心（国内 STUN 已配置）
├── MauiApp/                    # 安卓 APP（MAUI WebView 包装）
└── README.md
```

---

## 二、国内免费方案总览

| 组件 | 免费方案 | 费用 | 国内速度 |
|------|---------|------|---------|
| 信令服务器 | 腾讯云 CloudBase 云托管 | **0 元/月**（3000 资源点） | 国内节点，快 |
| STUN 打洞 | 腾讯/阿里云公共 STUN | **免费** | 延迟 30-90ms |
| TURN 中继 | 本地电脑 coturn + cpolar | **免费** | 取决于本地带宽 |
| 客户端 | 手机浏览器 / MAUI APK | **免费** | - |

> 信令服务器只传控制消息（每条几百字节），3000 资源点/月完全够用。
> 媒体流 P2P 直连，不走服务器，所以不卡。

---

## 三、方案 A：腾讯云 CloudBase 部署（推荐，国内不卡）

### 前置要求
- 腾讯云账号（实名认证，免费）
- 本项目代码上传到 GitHub/Gitee 仓库

### 步骤

#### 1. 开通 CloudBase 免费环境

1. 访问 [https://console.cloud.tencent.com/tcb](https://console.cloud.tencent.com/tcb)
2. 点击「新建环境」，选择「**免费体验版**」（0 元/月，3000 资源点）
3. 环境名称随意，选择「按量计费」（免费额度内不扣费）
4. 等待环境创建完成（约 1-2 分钟）

#### 2. 创建云托管服务

1. 进入环境 → 左侧菜单「云托管」→「服务列表」→「新建服务」
2. 服务名称：`screen-share`
3. 部署方式：选择「**代码仓库**」，授权你的 GitHub/Gitee
4. 选择本项目仓库，分支 `main`
5. 构建配置：
   - 构建方式：**Dockerfile**
   - Dockerfile 路径：`Dockerfile`（项目根目录已提供）
   - 监听端口：`80`
6. 高级设置 → 环境变量：无需额外配置
7. 点击「部署」，等待构建完成（约 3-5 分钟）

#### 3. 获取公网地址

1. 部署成功后，在服务详情页找到「**默认域名**」
2. 格式如：`https://screen-share-xxx.ap-shanghai.app.tcloudbase.com`
3. 这就是你的信令服务器 + 网页客户端地址，自带 HTTPS
4. 手机浏览器直接访问该地址即可使用

#### 4. 验证

- 访问 `https://你的域名/health` 应返回 `Healthy`
- 访问 `https://你的域名/` 应看到登录页面
- 两台手机输入相同房间号即可连接

> CloudBase 网关 WebSocket 空闲 60 秒断开，本项目 SignalR 已配置 15 秒心跳，自动保持连接。

---

## 四、方案 B：本地电脑 + cpolar 内网穿透（零成本，无需云账号）

适合没有云账号、电脑可以一直开机的场景。

### 步骤

#### 1. 本地运行信令服务器

```bash
cd SignalServer
dotnet run
```
服务启动在 `http://localhost:80`

#### 2. 安装 cpolar

1. 访问 [https://www.cpolar.com](https://www.cpolar.com) 注册免费账号
2. 下载 Windows 客户端并安装
3. 登录后验证 token（官网 dashboard 有命令）

#### 3. 创建 HTTPS 隧道

```bash
cpolar http 80
```
输出类似：
```
Forwarding  https://xxxx.cpolar.io -> localhost:80
```
这个 `https://xxxx.cpolar.io` 就是公网地址。

#### 4. 手机访问

- 两台手机浏览器打开 `https://xxxx.cpolar.io`
- 输入相同房间号即可使用

> cpolar 免费版：1Mbps 带宽，不限流量，国内节点。
> 信令数据量极小，1Mbps 完全够用。
> 缺点：免费域名每 24 小时自动更换，重启 cpolar 后地址会变。

---

## 五、非局域网连接原理（STUN + TURN）

### STUN（已配置国内服务器，免费）

作用：让手机发现自己的公网 IP，实现 P2P 打洞。

本项目已内置国内 STUN：
```
stun:stun.qq.com:3478       (腾讯，延迟最低)
stun:stun.aliyun.com:3478   (阿里云)
stun:stun.miwifi.com:3478   (小米)
```

约 70%-80% 的家用宽带/4G/5G 可通过 STUN 实现 P2P 直连，直连时不卡。

### TURN（打洞失败时需要，零成本方案）

当双方都是对称 NAT（部分企业网、校园网、特殊运营商），P2P 打洞失败，需要 TURN 中继。

**国内没有免费公共 TURN 服务器**（TURN 耗带宽，没人免费提供）。零成本方案：

#### 用本地电脑跑 coturn + cpolar 穿透

1. 电脑安装 coturn：
   ```bash
   # Windows 下载 coturn 编译版，或用 WSL
   # Ubuntu/WSL:
   sudo apt install coturn
   ```

2. 配置 `/etc/turnserver.conf`：
   ```
   listening-port=3478
   fingerprint
   lt-cred-mech
   user=screenuser:screenpass123
   realm=screen-share
   no-multicast-peers
   ```

3. 启动：
   ```bash
   turnserver -c /etc/turnserver.conf
   ```

4. cpolar 穿透 TCP 3478 端口：
   ```bash
   cpolar tcp 3478
   ```
   获得 `tcp://xxx.cpolar.io:xxxxx`

5. 在 `app.js` 的 ICE_CONFIG 中添加：
   ```javascript
   {
       urls: 'turn:xxx.cpolar.io:xxxxx',
       username: 'screenuser',
       credential: 'screenpass123'
   }
   ```

> TURN 中继时延迟取决于电脑上行带宽，建议 10Mbps 以上。
> 大部分情况 P2P 直连即可，不需要 TURN。

---

## 六、使用方法

### 连接
1. 双方手机浏览器打开部署好的网址（HTTPS）
2. 输入**相同房间号**（如 `8888`）
3. 点击「加入房间」

### 双向语音通话
- 双方各自点击「🎤 开麦」
- 即可实时对话（已开启回声消除、降噪、自动增益）

### 屏幕共享 + 一起看
- 共享方点击「📺 共享屏幕」
- 选择要共享的屏幕/应用，勾选「共享音频」可传系统声音
- 对方自动看到画面 + 听到声音
- 双方可同时开麦，边看边讨论

### 挂断
- 点击「📞 挂断」，释放所有资源

---

## 七、MAUI 安卓 APP 编译

1. VS 2022 打开 `MauiApp/MauiApp.csproj`（安装 .NET MAUI 工作负载）
2. 修改 `MainPage.xaml` 中的地址：
   ```xml
   <local:MediaWebView x:Name="webView" Source="https://你的CloudBase域名" />
   ```
3. 连接安卓手机（USB 调试），按 F5 运行
4. 或右键项目 → 发布 → 生成 APK

> ⚠️ Android WebView 对屏幕共享（getDisplayMedia）支持有限，语音通话正常。
> 完整体验建议用手机 Chrome 浏览器访问网页版。

---

## 八、卡顿优化

| 优化项 | 说明 |
|--------|------|
| 国内 STUN | 已配置腾讯/阿里云 STUN，打洞快 |
| P2P 直连 | 媒体端到端，延迟 < 100ms（默认） |
| 分辨率 | 屏幕共享 720p/30fps，可在 app.js 调整 |
| 码率自适应 | WebRTC 内置，网络差自动降质 |
| 5GHz WiFi | 比 2.4G/4G 更稳定 |
| TURN 就近 | 必须中继时，TURN 服务器离用户越近越好 |

---

## 九、常见问题

**Q: 手机提示"无法访问麦克风/屏幕"？**
A: 必须 HTTPS。CloudBase 自带 HTTPS；本地调试用 localhost 或 cpolar HTTPS 地址。

**Q: 双方都加入了但看不到画面？**
A: 看右上角连接状态。显示"连接失败(需TURN)"说明 P2P 打洞失败，按第五节配置 TURN。

**Q: CloudBase 免费版够用吗？**
A: 信令服务器只传小消息，3000 资源点/月足够几十人同时使用。媒体走 P2P 不耗服务器资源。

**Q: CloudBase 会休眠吗？**
A: 云托管流量低谷自动缩容到 0，首次访问需等待约 10 秒冷启动。SignalR 15 秒心跳保持连接。

**Q: iOS 能用吗？**
A: iOS Safari 15+ 支持。需要 HTTPS。

**Q: 最多支持几人？**
A: 当前 1 对 1 架构。多人会议需 SFU 架构（如 mediasoup），不在本方案范围。

**Q: cpolar 免费版域名变了怎么办？**
A: 重新运行 `cpolar http 80` 获取新地址，手机访问新地址即可。信令不存数据，换地址不影响。

---

## 十、信令服务器代码说明

### SignalHub.cs 核心方法

| 方法 | 作用 |
|------|------|
| `JoinRoom(roomId)` | 加入房间，通知其他人 |
| `SendOffer(roomId, sdp)` | 转发发起方的会话描述 |
| `SendAnswer(roomId, sdp)` | 转发应答方的会话描述 |
| `SendIceCandidate(...)` | 转发 NAT 穿透地址 |
| `OnDisconnectedAsync` | 用户断开时通知 |

**信令服务器不传输任何媒体数据**，只做"握手介绍"。视频和音频全部走 WebRTC P2P 直连。
