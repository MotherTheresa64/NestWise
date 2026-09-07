import type { CareEvent, EventDetails, EventInput, FoodServing } from './index';
export function mealFoods(details: EventDetails): FoodServing[] {
  return details.foods?.length ? details.foods : details.food?.trim() ? [{ name: details.food }] : [];
}
export function eventSummary(event: Pick<EventInput, 'category' | 'details'>): string {
  const d = event.details; const amount = d.quantity === undefined ? '' : `${d.quantity} ${d.unit || ''}`.trim();
  const join = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' · ');
  switch (event.category) {
    case 'bottle': return [amount, d.milkType === 'other' ? d.liquidName || 'other liquid' : d.milkType, 'bottle'].filter(Boolean).join(' ');
    case 'nursing': return join('Nursing', d.side, d.leftMinutes === undefined ? '' : `left ${d.leftMinutes} min`, d.rightMinutes === undefined ? '' : `right ${d.rightMinutes} min`);
    case 'pumping': return join('Pumping', amount, d.side, d.pumpMethod);
    case 'food': { const foods = mealFoods(d); return foods.length ? foods.map(f => join(f.name, f.amount === undefined ? '' : `${f.amount} ${f.unit}`, f.preference, f.sensitivityObserved && 'sensitivity observed')).join(' + ') : 'Food'; }
    case 'diaper': case 'potty': return join(event.category === 'potty' ? `Potty ${d.pottyResult || 'attempt'}` : `${{ wet: 'Pee', dirty: 'Poo', mixed: 'Mixed', dry: 'Dry' }[d.diaperType || 'wet']} diaper`, d.peeAmount && `${d.peeAmount} pee`, d.pooAmount && `${d.pooAmount} poo`, d.diaperRash && 'rash observed');
    case 'sleep': return join(d.sleepKind === 'night' ? 'Night sleep' : 'Nap', d.sleepLocation);
    case 'medicine': return join(d.medicineName || 'Medicine', amount, d.scheduledContext);
    case 'temperature': return join(amount ? amount.replace(' C', ' °C').replace(' F', ' °F') : 'Temperature', d.temperatureMethod);
    case 'symptom': return d.symptoms?.length ? d.symptoms.map(s => join(s.name, s.severity)).join(' + ') : join(d.symptomName || 'Symptom', d.severity);
    case 'growth': return join(d.measurement === 'head' ? 'Head circumference' : d.measurement === 'height' ? 'Length / height' : 'Weight', amount);
    case 'teeth': return join('Teeth', d.teethAction, d.tooth);
    case 'bath': return join(d.bathKind || 'Bath', d.sessionMinutes === undefined ? '' : `${d.sessionMinutes} min`);
    case 'routine': return join(d.activityName || 'Routine', d.routineSteps?.join(', '));
    case 'milestone': return d.milestoneName || 'Milestone';
    case 'water': return join('Water', amount);
    default: return join(d.customLabel || d.activityName || 'Care activity', d.sessionMinutes === undefined ? '' : `${d.sessionMinutes} min`);
  }
}
/** A repeat is a fresh reviewed draft. Never copy medical readings, observations or active timers. */
export function repeatDetails(event: Pick<CareEvent, 'category' | 'details'>): EventDetails {
  const d = event.details;
  switch (event.category) {
    case 'bottle': case 'water': return { quantity: d.quantity, unit: d.unit, milkType: d.milkType, liquidName: d.liquidName };
    case 'food': return { foods: mealFoods(d).map(({ foodId, name, amount, unit }) => ({ foodId, name, amount, unit })), foodTexture: d.foodTexture };
    case 'diaper': case 'potty': return { diaperType: d.diaperType };
    case 'medicine': return { medicineName: d.medicineName, unit: d.unit, medicineRoute: d.medicineRoute };
    case 'temperature': case 'growth': return { unit: d.unit, measurement: d.measurement, temperatureMethod: d.temperatureMethod };
    case 'sleep': return { sleepKind: d.sleepKind, sleepLocation: d.sleepLocation };
    case 'nursing': return { side: d.side };
    case 'pumping': return { side: d.side, unit: d.unit, pumpMethod: d.pumpMethod, milkType: d.milkType };
    default: return {};
  }
}
