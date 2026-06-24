"use client"

import { useState, useEffect } from "react"

export function useMobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768) // Consideramos móvil si el ancho es menor a 768px
        }

        // Comprobamos inicialmente
        checkMobile()

        // Añadimos un listener para el evento resize
        window.addEventListener("resize", checkMobile)

        // Limpiamos el listener cuando el componente se desmonta
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    return isMobile
}

