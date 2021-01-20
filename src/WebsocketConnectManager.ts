import * as Websocket from 'ws';
import { IWebsocketServer } from './index'
import { IMessagePool } from './messagePool'
import { WebsocketGroups } from './WebsocketGroupsManager';

export interface IWebsocket extends Websocket {
    isAlive?: boolean
    groups?: Set<WebsocketGroups>
    groupParamsMap?: Map<WebsocketGroups, any>
    run?: ((socket:Websocket, preProcessResult:any) => void) | ((socket:Websocket, preProcessResult: any) => Promise<void>)
}

export class WebsocketConnectManager {
    private _ip: string;
    private _socket: IWebsocket;
    private _server: IWebsocketServer;
    private _messagePool: IMessagePool;
    constructor(server: IWebsocketServer, socket: Websocket, req: Request, messagePool: IMessagePool) {
        this._server = server
        this._socket = socket
        this._messagePool = messagePool
        this._socket.groups = new Set()
        this._socket.groupParamsMap = new Map()
        this._ip = req?.headers['x-forwarded-for']?.split(/\s*,\s*/)[0];
        this.setAlive(true)
        this.addWebsocketGroups(req.url)
        this.addListeners()
        // 链接检查
        this._socket.ping()
    }
    protected addWebsocketGroups(key?: string|{ key?:string, params?: any }, params?: any): void {
        if (typeof key === 'object') {
            const data = key
            key = data?.key
            params = data?.params
        }
        if (!key || key === '/') { return; }
        const groupKey = this._server.groupsManager.getGroupByKey(key)
        this._socket.groups = this._socket?.groups?.add(groupKey)
        this._server.groupsManager.setGroupsSet()
        if (params) {
            const config = this._server.groupsManager.getConfigByKey(groupKey)
            if (config && config.getData) {
                this._socket.groupParamsMap?.set(groupKey, config.getData.bind(this, params))
            }
        }
    }
    protected removeWebsocketGroups(key?: string): void {
        if (!key) { return; }
        if (!this._socket.groups) { return; }
        if (!this._socket.groups.size) { return; }
        const groupKey = this._server.groupsManager.getGroupByKey(key)
        this._socket.groups.delete(groupKey)
        this._socket.groupParamsMap?.delete(groupKey)
        this._server.groupsManager.setGroupsSet()
        if (!this._socket.groups.size) {
            // 不存在分组取消订阅
            this._messagePool.dissubscription(this._socket)
        }
    }

    // 订阅messagePool
    protected subscription() {
        this._socket.run = (async (socket: IWebsocket, preProcessResult:any) => {  
            if (!socket?.groups?.size) {
                this._messagePool.dissubscription(socket)
                return;
            }

            // 全局消息
            let data = preProcessResult.filter(data => {
                if ((socket?.groups || new Set()).has(data.key)) {
                    return true
                }
                return false
            })

            // 私人消息
            const groupParamsMap = socket?.groupParamsMap || new Map()
            if (groupParamsMap.size) {
                groupParamsMap.forEach(async (getdata: () => Promise<any>, groupKey: WebsocketGroups) => {
                    data.push({
                        key: groupKey,
                        data: await getdata()
                    })
                })
            }

            if (!data.length) {
                this._messagePool.dissubscription(socket)
                return;
            }
            // 全部数据按分组拿到，这里可以处理格式化一下返回数据，再发送
            socket.send(JSON.stringify(data))
        }).bind(this)
        this._messagePool.subscription(this._socket)
    }
    protected setAlive(isAlive: boolean) {
        this._socket.isAlive = isAlive
    }
    protected addListeners() {
        this.messageListener()
        this.errorListener()
        this.closeListener()
        this.pongListener()
    }
    protected messageListener() {
        this._socket.on('message', (message: any) => {
            console.log('message', message)
            if (typeof message === 'string') {
                try {
                    message = JSON.parse(message) 
                } catch (error) {
                    console.error('解析message失败')
                }
            }
            if (typeof message === 'object' && message.type) {
                switch (message.type) {
                    case 'subscription':
                        this.subscription()
                        break;
                    case 'dissubscription':
                        this._messagePool.dissubscription(this._socket)
                        break;
                    case 'addGroups':
                        this.addWebsocketGroups(message.data)
                        break;
                    case 'removeGroups':
                        this.removeWebsocketGroups(message.data)
                        break;
                    case 'notification':
                        this.notificationMessage(message.data)
                    default:
                        break;
                }
            }
        });
    }
    protected notificationMessage(data:any = {}) {
        const WebsocketGroupsMap = new Map(Object.keys(WebsocketGroups).map((key: string) => [WebsocketGroups[key], key]))
        if (!WebsocketGroupsMap.get(data?.group)) { return }

        this.broadcast(data, data?.group)
    }
    protected errorListener() {
        this._socket.on('error', (err: Error) => {
            console.error(err.stack || err.message)
        })
    }
    protected closeListener() {
        this._socket.on('close', () => {
            this._messagePool.dissubscription(this._socket)
            console.log('socket connect close')
        })
    }
    protected pongListener() {
        this._socket.on('pong', (() => {
            this._socket.isAlive = true;
            console.log('pong')
          }).bind(this)
        );
    }
    protected broadcast(data:any, groupName?: WebsocketGroups) {
        this._server.clients.forEach(function each(client: IWebsocket) {
            if (!groupName || (!client?.groups?.size || !client?.groups.has(groupName))) {
               return;
            }
            if (client.readyState === Websocket.OPEN) {
              client.send(JSON.stringify(data));
            }
        });
    }
}