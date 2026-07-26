import {
  CaptionsIcon,
  FileTextIcon,
  FileTypeIcon,
  GlobeIcon,
  ImageIcon,
  ListVideoIcon,
  VideoIcon,
} from "lucide-react"

import type { UploadType } from "@/components/dashboard/types"

const ICONS = {
  pdf: FileTypeIcon,
  doc: FileTextIcon,
  text: FileTextIcon,
  vtt: CaptionsIcon,
  webpage: GlobeIcon,
  youtube: VideoIcon,
  playlist: ListVideoIcon,
  image: ImageIcon,
} as const

export function SourceIcon({
  type,
  className,
}: {
  type: UploadType
  className?: string
}) {
  const Icon = ICONS[type] ?? FileTextIcon
  return <Icon className={className} />
}
