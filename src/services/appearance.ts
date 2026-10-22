import {useEffect,useState} from 'react';
export type Theme='light'|'dark';
export function useAppearance() {
 const [theme,setTheme]=useState<Theme>(()=>{try{return localStorage.getItem('krypta-appearance')==='dark'?'dark':'light';}catch{return 'light';}});
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;try{localStorage.setItem('krypta-appearance',theme);}catch{}},[theme]);
 return {theme,toggleTheme:()=>setTheme(current=>current==='dark'?'light':'dark')};
}
