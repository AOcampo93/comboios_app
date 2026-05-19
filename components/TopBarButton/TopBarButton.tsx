import { CSSProperties, ReactNode } from "react";
import styles from "./TopBarButton.module.css";

export default function TopBarButton({
    children,
    style,
    onClick,
    title,
}: {
    children: ReactNode;
    style?: CSSProperties;
    onClick: () => void;
    title?: string;
}) {
    return (
        <div
            className={styles.topBarButton}
            style={style}
            onClick={onClick}
            title={title}
        >
            {children}
        </div>
    );
}
