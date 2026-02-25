import Image from "next/image";
import Thumbnail from "@gd/components/Thumbnail";
import FormattedDateTime from "@gd/components/FormattedDateTime";
import { formatFileSizeDisplay, formatDateTime, getDriveThumbnailUrl } from "@gd/lib/utils";
import React from "react";
import { Input } from "@gd/components/ui/input";
import { Button } from "@gd/components/ui/button";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
const thumbnailUrl = (file: DriveFileDisplay) => file.thumbnailLink ||
    (file.type === "document" || file.type === "video" ? getDriveThumbnailUrl(file.$id) : undefined) ||
    file.url;
const ImageThumbnail = ({ file }: {
    file: DriveFileDisplay;
}) => (<div className="file-details-thumbnail">
    <Thumbnail type={file.type} extension={file.extension} url={thumbnailUrl(file)}/>
    <div className="flex flex-col">
      <p className="subtitle-2 mb-1">{file.name}</p>
      <FormattedDateTime date={file.$createdAt} className="caption"/>
    </div>
  </div>);
const DetailRow = ({ label, value }: {
    label: string;
    value: string;
}) => (<div className="flex">
    <p className="file-details-label text-left">{label}</p>
    <p className="file-details-value text-left">{value}</p>
  </div>);
export const FileDetails = ({ file }: {
    file: DriveFileDisplay;
}) => {
    return (<>
      <ImageThumbnail file={file}/>
      <div className="space-y-4 px-2 pt-2">
        <DetailRow label="Format:" value={file.extension || "—"}/>
        <DetailRow label="Size:" value={formatFileSizeDisplay(file.size, file.mimeType)}/>
        <DetailRow label="Owner:" value={file.owner.fullName}/>
        <DetailRow label="Last edit:" value={formatDateTime(file.$updatedAt || file.$createdAt)}/>
      </div>
    </>);
};
interface Props {
    file: DriveFileDisplay;
    onInputChange: React.Dispatch<React.SetStateAction<string[]>>;
    onRemove: (email: string) => void;
}
export const ShareInput = ({ file, onInputChange, onRemove }: Props) => {
    const users = (file as any).users ?? [];
    return (<>
      <ImageThumbnail file={file}/>

      <div className="share-wrapper">
        <p className="subtitle-2 pl-1 text-light-100">
          Share file with other users
        </p>
        <Input type="email" placeholder="Enter email address" onChange={(e) => onInputChange(e.target.value.trim().split(","))} className="share-input-field"/>
        <div className="pt-4">
          <div className="flex justify-between">
            <p className="subtitle-2 text-light-100">Shared with</p>
            <p className="subtitle-2 text-light-200">
              {users.length} users
            </p>
          </div>

          <ul className="pt-2">
            {users.map((email: string) => (<li key={email} className="flex items-center justify-between gap-2">
                <p className="subtitle-2">{email}</p>
                <Button onClick={() => onRemove(email)} className="share-remove-user">
                  <Image src="/gdrive/assets/icons/remove.svg" alt="Remove" width={24} height={24} className="remove-icon"/>
                </Button>
              </li>))}
          </ul>
        </div>
      </div>
    </>);
};
