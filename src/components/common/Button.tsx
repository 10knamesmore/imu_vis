interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "none",
                backgroundColor: disabled ? "#ccc" : "#4a90e2",
                color: "#fff",
                fontWeight: "bold",
                transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => { if (!disabled) (e.currentTarget.style.backgroundColor = "#357ABD") }}
            onMouseOut={(e) => { if (!disabled) (e.currentTarget.style.backgroundColor = "#4a90e2") }}
        >
            {label}
        </button>
    );
}