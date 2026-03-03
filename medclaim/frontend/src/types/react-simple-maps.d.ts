declare module "react-simple-maps" {
  import { ComponentType, SVGProps } from "react"

  interface Geography {
    rsmKey: string
    properties: {
      name: string
      [key: string]: any
    }
    id: string
  }

  interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    projection?: string
    projectionConfig?: {
      rotate?: [number, number, number]
      scale?: number
      center?: [number, number]
    }
    width?: number
    height?: number
  }

  interface ZoomableGroupProps {
    center?: [number, number]
    zoom?: number
    children?: React.ReactNode
  }

  interface GeographiesProps {
    geography: string | object
    children: (data: { geographies: Geography[] }) => React.ReactNode
  }

  interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: Geography
    style?: {
      default?: React.CSSProperties
      hover?: React.CSSProperties
      pressed?: React.CSSProperties
    }
  }

  interface MarkerProps extends SVGProps<SVGGElement> {
    coordinates: [number, number]
  }

  export const ComposableMap: ComponentType<ComposableMapProps>
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>
  export const Geographies: ComponentType<GeographiesProps>
  export const Geography: ComponentType<GeographyProps>
  export const Marker: ComponentType<MarkerProps>
}