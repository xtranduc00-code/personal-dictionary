import { DRIVE_BASE, drivePath } from "../drive-base";
export const navItems = [
    {
        name: "Dashboard",
        icon: "/gdrive/assets/icons/dashboard.svg",
        url: DRIVE_BASE,
    },
    {
        name: "Folders",
        icon: "/gdrive/assets/icons/documents.svg",
        url: drivePath("/folders"),
    },
    {
        name: "Documents",
        icon: "/gdrive/assets/icons/documents.svg",
        url: drivePath("/documents"),
    },
    {
        name: "Images",
        icon: "/gdrive/assets/icons/images.svg",
        url: drivePath("/images"),
    },
    {
        name: "Media",
        icon: "/gdrive/assets/icons/video.svg",
        url: drivePath("/media"),
    },
    {
        name: "Starred",
        icon: "/gdrive/assets/icons/star.svg",
        url: drivePath("/starred"),
    },
];
export const actionsDropdownItems = [
    {
        label: "Rename",
        icon: "/gdrive/assets/icons/edit.svg",
        value: "rename",
    },
    {
        label: "Details",
        icon: "/gdrive/assets/icons/info.svg",
        value: "details",
    },
    {
        label: "Share",
        icon: "/gdrive/assets/icons/share.svg",
        value: "share",
    },
    {
        label: "Download",
        icon: "/gdrive/assets/icons/download.svg",
        value: "download",
    },
    {
        label: "Delete",
        icon: "/gdrive/assets/icons/delete.svg",
        value: "delete",
    },
];
export const sortTypes = [
    {
        label: "Date created (newest)",
        value: "$createdAt-desc",
    },
    {
        label: "Created Date (oldest)",
        value: "$createdAt-asc",
    },
    {
        label: "Name (A-Z)",
        value: "name-asc",
    },
    {
        label: "Name (Z-A)",
        value: "name-desc",
    },
    {
        label: "Size (Highest)",
        value: "size-desc",
    },
    {
        label: "Size (Lowest)",
        value: "size-asc",
    },
];
export const avatarPlaceholderUrl = "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const FOLDER_ICON_OPTIONS = [
    { id: "folder", path: "/gdrive/assets/icons/documents.svg", label: "Folder" },
    { id: "images", path: "/gdrive/assets/icons/images.svg", label: "Images" },
    { id: "video", path: "/gdrive/assets/icons/video.svg", label: "Media" },
    { id: "others", path: "/gdrive/assets/icons/others.svg", label: "Others" },
    { id: "file-doc", path: "/gdrive/assets/icons/file-document.svg", label: "Document" },
    { id: "file-pdf", path: "/gdrive/assets/icons/file-pdf.svg", label: "PDF" },
] as const;
