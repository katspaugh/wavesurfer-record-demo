/** MP3 export settings shared between the worker and the host. */

export type Mp3BitRate = 16 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 112 | 128 | 160 | 192 | 224 | 256 | 320
export type Mp3ChannelCount = 1 | 2

export type Mp3ExportSettings = {
  bitRate: Mp3BitRate
  channelCount: Mp3ChannelCount
}

export const MP3_BIT_RATES: Mp3BitRate[] = [16, 24, 32, 40, 48, 64, 96, 128, 160, 192, 256, 320]
export const DEFAULT_MP3_EXPORT_SETTINGS: Mp3ExportSettings = {
  bitRate: 32,
  channelCount: 1,
}
