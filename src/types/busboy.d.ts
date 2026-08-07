declare module 'busboy' {
  import { Writable, Readable } from 'stream'

  interface BusboyFileInfo {
    filename: string
    encoding: string
    mimeType: string
  }

  interface BusboyConfig {
    headers: Record<string, string>
    limits?: Record<string, number>
  }

  interface Busboy extends Writable {
    on(event: 'field', listener: (name: string, value: string) => void): this
    on(event: 'file', listener: (name: string, stream: Readable, info: BusboyFileInfo) => void): this
    on(event: 'finish', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
  }

  export default function busboy(config: BusboyConfig): Busboy
}
