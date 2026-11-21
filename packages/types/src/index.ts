export interface Website {
  id: string
  name: string
  url: string
  description?: string
  categoryId: string
  tagIds: string[]
  favicon?: string
  visitCount: number
  lastVisited?: Date
  isFavorite?: boolean
  isOnline: boolean
  createdAt: Date
  updatedAt: Date
  order?: number
  favoriteOrder?: number
}

export interface Category {
  id: string
  name: string
  description?: string
  icon?: string
  order: number
  websiteCount: number
  /** 是否对外公开（访客可见）。缺省视为公开；false 时该分类及其下网站不出现在公开数据中 */
  isPublic?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  color: string
  order: number
  usageCount: number
  createdAt: Date
  updatedAt: Date
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto'
  autoBackup: boolean
  /** 是否播放 AI 助手贴边小鸟动效 */
  aiAnimationEnabled?: boolean
  defaultHome?: 'home' | 'all'
  /** 背景壁纸模式：关闭 / 必应每日一图 / 自定义图片 URL（仅存本设备） */
  wallpaperMode?: 'none' | 'bing' | 'url'
  /** 自定义壁纸图片地址（wallpaperMode === 'url' 时生效） */
  wallpaperUrl?: string
  /** 自动备份的最小间隔：'off' 关闭自动备份；'daily' 每天；'weekly' 每 7 天；'monthly' 每 30 天 */
  backupFrequency?: 'off' | 'daily' | 'weekly' | 'monthly'
}

export interface UserPreferences {
  defaultHome: 'home' | 'all'
  aiAnimationEnabled: boolean
}

export interface BackupData {
  websites: Partial<Website>[]
  categories: Partial<Category>[]
  tags: Partial<Tag>[]
  /** @deprecated Kept only to parse legacy backup files; not exported or restored. */
  settings?: Partial<UserSettings>
}

/**
 * Cross-device sync intentionally excludes device preferences.
 */
export type SyncData = Pick<BackupData, 'websites' | 'categories' | 'tags'>

export interface BackupMetadata {
  version: string
  createdAt: string
  appVersion?: string
  platform?: string
}

export interface BackupPayload {
  meta: BackupMetadata
  data: BackupData
}

export interface SyncPayload {
  meta: BackupMetadata
  data: SyncData
}
