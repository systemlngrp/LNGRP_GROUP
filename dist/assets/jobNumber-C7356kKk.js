function e(n){const r=String(n??"").trim();if(!r)return"";const t=r.match(/^(.*?\/)?(\d+)$/);if(!t)return r;const o=t[1]||"",c=t[2].replace(/^0+(?=\d)/,"");return`${o}${c}`}export{e as n};
