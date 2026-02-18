import React from 'react';
import styles from './Skeleton.module.css';
import { clsx } from 'clsx'; // Assuming clsx is installed, based on package.json

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    width?: string | number;
    height?: string | number;
    circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className,
    width,
    height,
    circle,
    style,
    ...props
}) => {
    return (
        <div
            className={clsx(styles.skeleton, className)}
            style={{
                width: width,
                height: height,
                borderRadius: circle ? '50%' : undefined,
                ...style
            }}
            {...props}
        />
    );
};
