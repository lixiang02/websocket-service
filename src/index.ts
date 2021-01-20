import * as Websocket from 'ws';
import messagePool, { IMessagePool } from './messagePool';
import { WebsocketConnectManager, IWebsocket } from './WebsocketConnectManager';
import { WebsocketGroupsManager } from './WebsocketGroupsManager';

export interface IWebsocketServer extends Websocket.Server {
    groupsManager: WebsocketGroupsManager
}

export class WebSocketCenter {
    private _port: number = 4000;
    private _server: IWebsocketServer;
    private _interval: any;
    private _messagePool: IMessagePool = messagePool;
    constructor(port?: number) {
        if (process.env.NO_NEED_WEBSOCKET) { return; }
        this.setPort(port)
        this.startServer()
        this.setGroupsManager()
        this.setMessagePoolPreProcessPublish()
        this.addListeners()
        this.addConnectHealthyCheck()
        console.log('WebSocket Server is running on port ', this._port);
    }

    protected setPort(port?:number) {
        if (port) {
            this._port = port
        } else if (process.env.WS_PORT && Number(process.env.WS_PORT) >= 0) {
            this._port = Number(process.env.WS_PORT)
        } 
    }
    protected startServer() {
        this._server = new Websocket.Server({ port: this._port }) as IWebsocketServer; 
    }
    protected setGroupsManager() {
        this._server.groupsManager = new WebsocketGroupsManager(this._server)
    }
    // 设置messagePool预处理发布函数
    protected setMessagePoolPreProcessPublish() {
        this._messagePool.preProcessPublish = (async () => {
            // 根据group获取数据,按组返回数据
            return await this._server.groupsManager.getAllByGroups()
        }).bind(this)
    }
    protected addListeners() {
        this.connectListener()
        this.closeListener()
        this.errorListener()
    }
    protected connectListener() {
        this._server.on('connection', (ws: Websocket, req: Request)  => {
            console.log('WebSocket connect successful', req.url)
            new WebsocketConnectManager(this._server, ws, req, messagePool)
        });
    }
    protected closeListener() {
        this._server.on('close', () => {
            clearInterval(this._interval);
            console.log('WebSocket connect close')
        })
    }
    protected errorListener() {
        this._server.on('error', () => {
            clearInterval(this._interval);
            console.log('WebSocket connect error')
        }) 
    }
    protected addConnectHealthyCheck() {
        this._interval = setInterval((function ping() {
            this._server.clients.forEach(function each(ws: IWebsocket) {
              if (ws.isAlive === false) return ws.terminate();
          
              ws.isAlive = false;
              ws.ping();
            });
        }).bind(this), 30000);
    }
    public broadcast(data:any) {
        this._server.clients.forEach(function each(client: IWebsocket) {
            if (client.readyState === Websocket.OPEN) {
              client.send(data);
            }
        });
    }
}