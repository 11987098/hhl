# ===== 构建阶段 =====
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 先复制 csproj 还原依赖（利用 Docker 缓存）
COPY SignalServer/SignalServer.csproj SignalServer/
RUN dotnet restore SignalServer/SignalServer.csproj

# 复制全部源码并发布
COPY SignalServer/ SignalServer/
RUN dotnet publish SignalServer/SignalServer.csproj -c Release -o /app/publish

# ===== 运行阶段 =====
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# 监听 80 端口（CloudBase 云托管默认转发到 80）
ENV ASPNETCORE_URLS=http://+:80
EXPOSE 80

ENTRYPOINT ["dotnet", "SignalServer.dll"]
