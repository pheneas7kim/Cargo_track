// Utils related to Images

import BuildingIcon from "../Assets/svgs/BuildingIcon.svg"
import EntertainmentIcon from "../Assets/svgs/EntertainmentIcon.svg"
import FoodIcon from "../Assets/svgs/FoodIcon.svg"
import InvestmentIcon from "../Assets/svgs/InvestmentIcon.svg"
import WifiIcon from "../Assets/svgs/WifiIcon.svg"
import CarIcon from "../Assets/svgs/carIcon.svg"

function chooseCategoryImage(categoryEnum){

    switch (categoryEnum) {
        case 'INTERNET': 
            return WifiIcon;
        case 'INVESTMENT': 
            return InvestmentIcon;
        case 'UTILITIES': 
            return BuildingIcon;
        case 'ENTERTAINMENT': 
            return EntertainmentIcon;
        case 'FOOD': 
            return FoodIcon;
        default : return <></>
    }

}

export const ICONS_ENUM = {
    "INTERNET": WifiIcon,
    "INVESTMENT": InvestmentIcon,
    "UTILITIES": BuildingIcon,
    "ENTERTAINMENT": EntertainmentIcon,
    "FOOD": FoodIcon,
    "HOUSING": BuildingIcon,
    "TRANSPORTATION": CarIcon,
}