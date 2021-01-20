import * as Websocket from 'ws';
import { FetchUtils } from '@mcfed/utils';
import { IWebsocket } from './WebsocketConnectManager';

export enum WebsocketGroups {
    Global="global",
    Module="module",
    Custom="custom"
}
interface GroupConfigItem {
    key: WebsocketGroups
    subscribeable: boolean
    getData: (params?:any) => Promise<any>
}
const config: Array<GroupConfigItem> = [
    {
        key: WebsocketGroups.Global,
        subscribeable: true,
        getData: async () => {
            return { data: 1 }
        }
    },
    {
        key: WebsocketGroups.Module,
        subscribeable: true,
        getData: async (params?:any) => {
            return await FetchUtils.fetchGet('http://192.168.200.178:3000/mock/37/list')
        }
    },
    {
        key: WebsocketGroups.Custom,
        subscribeable: false,
        getData: async () => null
    }
]

export class WebsocketGroupsManager {
    private _server: Websocket.Server
    public groupsSet: Set<WebsocketGroups>
    constructor(server: Websocket.Server) {
        this._server = server
        this.setGroupsSet()
    }
    public setGroupsSet() {
        if (!this._server?.clients?.size) {
            this.groupsSet = new Set()
            return
        }
        this.groupsSet =  new Set(
            Array.from(this._server.clients)
                .map((socket: IWebsocket) => Array.from(socket?.groups || []))
                .reduce((pre:any, cur:any):any => [...pre, ...cur])
        )
    }
    public getGroupByKey(key: string): WebsocketGroups {
        const defaultKey = config[0] && config[0].key
        if (!key || defaultKey === key) { return defaultKey }
        const result = config.find(e => e.key === key || e.key.replace(/^\//g, '') === key.replace(/^\//g, ''))
        if (!result) { return defaultKey }
        return result.key
    }
    public async getAllByGroups() {
        return await Promise.all(Array.from(this.groupsSet).map(
            (key: WebsocketGroups) =>  (async (key: WebsocketGroups) => {
                    const config = this.getConfigByKey(key)
                    if (!config?.subscribeable) { return }
                    return {
                        key,
                        data: await config.getData()
                    }
            }).call(this, key)
        )).then((results:Array<any>) => {
            return results.filter(e => e)
        }).catch(console.error)
    }
    public getConfigByKey(key: WebsocketGroups): GroupConfigItem | null {
        return config.find(e => e.key === key) as GroupConfigItem | null
    }
}