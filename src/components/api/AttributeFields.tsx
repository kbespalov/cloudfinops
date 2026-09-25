'use client';
import type {FormEvent} from 'react';
import {OPERATOR_LABELS, type AttributeId, type AttributeOperator, type CategoryAttributes} from '@/lib/public-api/attribute-registry';
import {emptyAttributeDraft, type AttributeDrafts} from './attribute-form';
import styles from './ApiPage.module.css';
import {typograph} from './doc-text';

export function AttributeFields({category, drafts, onChange}: {category?: CategoryAttributes; drafts: AttributeDrafts; onChange: (value: AttributeDrafts) => void}) {
  if (!category) return <p className={styles.filterHint}>Выберите категорию, чтобы добавить фильтры по её характеристикам.</p>;
  return <div className={styles.attributeFields}>
    <label className={styles.idField}>Добавить характеристику<select value="" onChange={event => {
      if (event.target.value) onChange({...drafts, [event.target.value]: emptyAttributeDraft()});
    }}><option value="">Выберите поле</option>{category.attributes.filter(def => !drafts[def.id]).map(def => <option key={def.id} value={def.id} disabled={!def.knownCount}>{def.label}{def.unit ? `, ${def.unit}` : ''}{!def.knownCount ? ' · нет данных' : ''}</option>)}</select></label>
    {category.attributes.filter(def => drafts[def.id]).map(def => {
      const draft = drafts[def.id]!;
      const update = (patch: Partial<typeof draft>) => onChange({...drafts, [def.id]: {...draft, ...patch}});
      const numeric = def.type === 'integer' || def.type === 'number';
      const inputProps = {type: numeric ? 'number' : 'text', min: def.minimum ?? undefined, step: def.type === 'integer' ? 1 : 'any'};
      const inputChange = (key: 'value' | 'min' | 'max') => (event: FormEvent<HTMLInputElement>) => {
        const invalidKey = {value: 'invalidValue', min: 'invalidMin', max: 'invalidMax'}[key];
        update({[key]: event.currentTarget.value, [invalidKey]: event.currentTarget.validity.badInput});
      };
      // onInput also catches invalid -> empty transitions that React's onChange
      // coalesces because both states have the same native value ("").
      const valueChange = inputChange('value'), minChange = inputChange('min'), maxChange = inputChange('max');
      return <fieldset className={styles.attributeField} key={def.id}>
        <legend>{def.label}{def.unit ? `, ${def.unit}` : ''}</legend>
        <div className={styles.attributeFieldHead}><code>{def.id}</code><button type="button" onClick={() => {const next = {...drafts}; delete next[def.id as AttributeId]; onChange(next);}} aria-label={`Удалить фильтр ${def.label}`}>Удалить</button></div>
        <div className={styles.queryFields}>
          <label>Условие<select aria-label={`Условие: ${def.label}`} value={draft.operator} onChange={e => update({operator: e.target.value as AttributeOperator})}>{def.operators.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}</select></label>
          {draft.operator === 'eq' && <label>Значение{def.allowedValues ? <select aria-label={def.label} value={draft.value} onChange={e => update({value: e.target.value})}><option value="">Выберите значение</option>{def.allowedValues.map(value => <option key={value} value={value}>{def.values.find(item => item.value === value)?.label ?? value}</option>)}</select> : <><input aria-label={def.label} {...inputProps} list={`attribute-${def.id}`} value={draft.value} onChange={valueChange} onInput={valueChange}/><datalist id={`attribute-${def.id}`}>{def.values.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</datalist></>}</label>}
          {draft.operator === 'in' && <label>Значения<select aria-label={`Значения: ${def.label}`} multiple value={draft.values} onChange={e => update({values: Array.from(e.target.selectedOptions, option => option.value)})}>{def.values.map(item => <option key={item.value} value={String(item.value)}>{item.label} · {item.productCount} SKU</option>)}</select><small>Для нескольких значений удерживайте ⌘ / Ctrl.</small></label>}
          {draft.operator === 'range' && <div className={styles.rangeFields}><label>От<input aria-label={`От: ${def.label}`} {...inputProps} value={draft.min} onChange={minChange} onInput={minChange}/></label><label>До<input aria-label={`До: ${def.label}`} {...inputProps} value={draft.max} onChange={maxChange} onInput={maxChange}/></label></div>}
        </div>
        <p className={styles.filterHint}>{def.description}</p>
        <small className={styles.filterHint}>Заполнено у {def.knownCount} из {category.productCount} SKU категории.{def.observedRange ? ` В каталоге: ${def.observedRange.min}–${def.observedRange.max}${def.unit ? ' ' + def.unit : ''}.` : ''} Неизвестные значения не попадут в результат.</small>
      </fieldset>;
    })}
  </div>;
}

export function AttributeReference({categories}: {categories: CategoryAttributes[]}) {
  return <section className={styles.docSection}><h2>Доступные характеристики</h2><p>{typograph('Список получен из того же реестра, который проверяет запросы API. Значения и заполненность относятся ко всей категории, до применения других фильтров.')}</p>
    {categories.map(category => <details key={category.category} className={styles.attributeReference}><summary>{category.title} · {category.productCount} SKU</summary>
      {category.attributes.map(def => <div className={styles.parameter} key={def.id}><div className={styles.parameterHead}><code>{def.id}</code><span>{def.type}{def.unit ? ' · ' + def.unit : ''}</span></div><p>{typograph(`${def.label}. ${def.description}`)}</p><small>{def.operators.map(op => OPERATOR_LABELS[op]).join(' · ')}. Заполнено: {def.knownCount} / {category.productCount}.</small>
        {def.allowedValues && <p>Допустимые значения: <code>{def.allowedValues.join(', ')}</code>.</p>}
        <p>Значения в каталоге: {def.values.length ? def.values.map(v => v.label).join(', ') : 'Нет данных'}.</p>
      </div>)}
    </details>)}
  </section>;
}
