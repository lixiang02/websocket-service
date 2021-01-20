import * as Websocket from 'ws';

export interface MWebsocket extends Websocket {
    run: ((socket:Websocket, preProcessResult:any) => void) | ((socket:Websocket, preProcessResult: any) => Promise<void>)
}
export interface IMessagePool {
    intervalTime: number
    subscription: (socket: Websocket)=>void
    dissubscription: (socket: Websocket)=>void
    preProcessPublish: () => Promise<any>
}

export class MessagePool implements IMessagePool {
    private _consumer: Set<MWebsocket> = new Set()
    private _running: boolean = false
    private _timer: NodeJS.Timeout
    public intervalTime: number = 3000 // 单位：ms
    public preProcessPublish: () => Promise<any> = async () => {}
    protected startTimedTask() {
        console.log('startTimedTask')

        if (this._running || !this._consumer.size) { return }
         this._timer = setInterval((function () {
            if (!this._consumer.size) {
                this._running = false
                this.clearTimer()
                return;
            }
            this.publish()
        }).bind(this), this.intervalTime)
        this._running = true
    }
    protected clearTimer() {
        clearTimeout(this._timer)
    }
    protected async publish() {
        console.log('publish')
        // 预处理
        const preProcessResult:any = await this.preProcessPublish()
        Promise.all(Array.from(this._consumer).map((socket:MWebsocket) => {
            return (async (socket: MWebsocket, preProcessResult: any) => {
                socket.run(socket, preProcessResult)
            }).call(this, socket, preProcessResult)
        }))
    }
    public subscription(socket: MWebsocket) {
        console.log('subscription')
        this._consumer.add(socket)
        this.startTimedTask()
    }
    public dissubscription(socket: MWebsocket) {
        console.log('dissubscription')
        this._consumer.delete(socket)
    }
}

export default new MessagePool()

