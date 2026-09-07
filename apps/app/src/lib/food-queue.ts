import type { CatalogFood, FoodMutation, FoodResult } from '@nestwise/shared';
export type FoodConflict = { mutation: FoodMutation; result: FoodResult };
export function optimisticFoods(foods: CatalogFood[], queue: FoodMutation[], householdId: string): CatalogFood[] {
  const result=new Map(foods.map(f=>[f.id,f]));
  for(const mutation of queue) result.set(mutation.foodId,{...mutation.food,id:mutation.foodId,householdId,version:mutation.baseVersion+1});
  return [...result.values()];
}
export function applyFoodResult(foods:CatalogFood[],result:FoodResult,foodId:string):CatalogFood[]{return [...foods.filter(f=>f.id!==foodId),...(result.food?[result.food]:[])];}
