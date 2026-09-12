import {DrawingUtils} from "../utils/DrawingUtils.js";

export class DungeonsDrawing extends DrawingUtils
{

    interpolate(dungeons, lpX, lpY, t)
    {
        for (const dungoenOne of dungeons)
        {
            this.interpolateEntity(dungoenOne, lpX, lpY, t);
        }
    }

    draw(ctx, dungeons)
    {
        for (const dungeonOne of dungeons)
        {
            if (dungeonOne.drawName === undefined) continue;

            const point = this.transformPoint(dungeonOne.hX, dungeonOne.hY);
            this.DrawCustomImage(ctx, point.x, point.y, dungeonOne.drawName, "Resources", 28);

            // Mist portals only differ from each other by the icon's tint (mist_0..mist_4),
            // which reads as basically the same color at this marker size/glance distance —
            // reported as "can't tell a 1/2/3 apart at a glance". A plain enchant number is
            // unambiguous regardless of color perception or icon size.
            if (dungeonOne.isMist && dungeonOne.enchant > 0) {
                const yOffset = this.getMarkerSize(20);
                ctx.save();
                ctx.font = `bold ${this.getScaledFontSize(11, 8)}px ${this.fontFamily}`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.fillText(String(dungeonOne.enchant), point.x + 1, point.y + yOffset + 1);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(String(dungeonOne.enchant), point.x, point.y + yOffset);
                ctx.restore();
            }
        }
    }
}