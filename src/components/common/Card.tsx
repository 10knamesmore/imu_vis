interface CardProps {
    title?: string;
    children: React.ReactNode;
}

export function Card({ title, children }: CardProps) {
    return (
        <div style={{
            padding: "1rem",
            backgroundColor: "#fff",
            borderRadius: "6px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "1rem",
        }}>
            {title && <h2>{title}</h2>}
            {children}
        </div>
    );
}