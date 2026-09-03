using Microsoft.AspNetCore.SignalR;

namespace SignalServer.Hubs;

/// <summary>
/// WebRTC 信令服务器 Hub
/// 只负责转发 SDP（Offer/Answer）和 ICE 候选，不传输任何媒体数据
/// 媒体流走 P2P 直连，不经过服务器，因此不卡、不耗服务器带宽
/// </summary>
public class SignalHub : Hub
{
    /// <summary>加入房间，同房间的两人可以互通</summary>
    public async Task JoinRoom(string roomId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
        // 通知房间内其他人：有新用户加入
        await Clients.OthersInGroup(roomId).SendAsync("UserJoined", Context.ConnectionId);
    }

    /// <summary>发起方发送 Offer SDP</summary>
    public async Task SendOffer(string roomId, string sdp)
    {
        await Clients.OthersInGroup(roomId).SendAsync("ReceiveOffer", Context.ConnectionId, sdp);
    }

    /// <summary>应答方回复 Answer SDP</summary>
    public async Task SendAnswer(string roomId, string sdp)
    {
        await Clients.OthersInGroup(roomId).SendAsync("ReceiveAnswer", Context.ConnectionId, sdp);
    }

    /// <summary>转发 ICE 候选（NAT 穿透地址）</summary>
    public async Task SendIceCandidate(string roomId, string candidate, string sdpMid, int sdpMLineIndex)
    {
        await Clients.OthersInGroup(roomId).SendAsync("ReceiveIceCandidate",
            Context.ConnectionId, candidate, sdpMid, sdpMLineIndex);
    }

    /// <summary>用户断开时通知所有人</summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Clients.All.SendAsync("UserLeft", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
