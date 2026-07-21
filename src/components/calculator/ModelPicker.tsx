'use client';

import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {
  Button,
  Dialog,
  Flex,
  Icon,
  Label,
  Text,
  TextInput,
} from '@gravity-ui/uikit';
import {Check, ChevronDown, ChevronLeft, Magnifier} from '@gravity-ui/icons';
import {ModelFamilyMark} from './ModelFamilyMark';
import {
  closedFieldMeta,
  filterByLab,
  findCatalogItemByDisplayName,
  getLabInfos,
  getModelPickerCatalog,
  highlightMatch,
  HOME_TASK_CHIPS,
  LAB_TASK_CHIPS,
  labTitle,
  loadRecentModelIds,
  matchesQuickFilter,
  pushRecentModelId,
  recommendedModels,
  resolveRecentModels,
  searchModels,
  sortLabModels,
  type LabId,
  type ModelPickerItem,
  type QuickFilterId,
} from '@/lib/calculator/model-picker-catalog';
import styles from './ModelPicker.module.css';

function HighlightedName({text, query}: {text: string; query: string}) {
  const hit = highlightMatch(text, query);
  if (!hit) {
    return (
      <Text variant="body-2" ellipsis className={styles.modelName}>
        {text}
      </Text>
    );
  }
  return (
    <Text variant="body-2" ellipsis className={styles.modelName}>
      {hit.before}
      <span className={styles.markHit}>{hit.match}</span>
      {hit.after}
    </Text>
  );
}

function ModelRow({
  item,
  query,
  selected,
  showBadge,
  onPick,
}: {
  item: ModelPickerItem;
  query: string;
  selected: boolean;
  showBadge?: boolean;
  onPick: (item: ModelPickerItem) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.modelRow}
      data-active={selected ? 'true' : 'false'}
      onClick={() => onPick(item)}
    >
      <ModelFamilyMark name={item.displayName} size={22} />
      <span className={styles.modelBody}>
        <HighlightedName text={item.displayName} query={query} />
        <Text variant="caption-2" color="secondary" ellipsis className={styles.modelMeta}>
          {item.metaLine}
          {showBadge && item.recommended
            ? ' · Рекомендуем'
            : showBadge && item.popular
              ? ' · Популярная'
              : ''}
        </Text>
      </span>
      <span className={styles.modelCheck} aria-hidden={!selected}>
        {selected ? <Icon data={Check} size={16} /> : null}
      </span>
    </button>
  );
}

function ModelList({
  items,
  value,
  query,
  showBadge,
  onPick,
  empty,
}: {
  items: ModelPickerItem[];
  value: string;
  query?: string;
  showBadge?: boolean;
  onPick: (item: ModelPickerItem) => void;
  empty?: ReactNode;
}) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <div className={styles.modelList} role="listbox">
      {items.map((item) => (
        <ModelRow
          key={item.id}
          item={item}
          query={query ?? ''}
          selected={item.displayName === value}
          showBadge={showBadge}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

export function ModelPicker({
  value,
  onUpdate,
}: {
  value: string;
  onUpdate: (displayName: string) => void;
}) {
  const catalog = useMemo(() => getModelPickerCatalog(), []);
  const labs = useMemo(() => getLabInfos(catalog), [catalog]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [labScope, setLabScope] = useState<LabId | null>(null);
  const [homeFilter, setHomeFilter] = useState<QuickFilterId | null>(null);
  const [labFilter, setLabFilter] = useState<'all' | QuickFilterId>('all');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = findCatalogItemByDisplayName(value, catalog);

  useEffect(() => {
    if (open) setRecentIds(loadRecentModelIds());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, labScope]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const recent = useMemo(() => resolveRecentModels(recentIds, catalog), [recentIds, catalog]);
  const recommended = useMemo(() => recommendedModels(catalog, 5), [catalog]);

  const searched = useMemo(() => searchModels(query, catalog), [query, catalog]);

  const homeModels = useMemo(() => {
    let items = searched;
    if (homeFilter) items = items.filter((m) => matchesQuickFilter(m, homeFilter));
    return items;
  }, [searched, homeFilter]);

  const labModels = useMemo(() => {
    if (!labScope) return [];
    let items = filterByLab(searched, labScope);
    if (labFilter !== 'all') {
      items = items.filter((m) => matchesQuickFilter(m, labFilter));
    }
    return sortLabModels(items);
  }, [searched, labScope, labFilter]);

  const otherLabHits = useMemo(() => {
    if (!labScope || labScope === 'all' || !query.trim()) return [];
    return searched.filter((m) => m.lab !== labScope).slice(0, 8);
  }, [labScope, query, searched]);

  const isSearchMode = query.trim().length > 0 && !labScope;

  function close() {
    setOpen(false);
    setQuery('');
    setHomeFilter(null);
  }

  function pick(item: ModelPickerItem) {
    onUpdate(item.displayName);
    setRecentIds(pushRecentModelId(item.id));
    close();
  }

  function openLab(id: LabId) {
    if (id === 'all') {
      setLabScope(null);
      setLabFilter('all');
      return;
    }
    setLabScope(id);
    setLabFilter('all');
    setHomeFilter(null);
  }

  function clearScope() {
    setLabScope(null);
    setLabFilter('all');
  }

  const showHome = !labScope;

  return (
    <div className={styles.triggerWrap}>
      <button
        type="button"
        className={styles.trigger}
        data-open={open ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={selected ? `${value}. ${closedFieldMeta(selected)}` : 'Выбор модели'}
        onClick={() => setOpen(true)}
      >
        <ModelFamilyMark name={value} size={18} />
        <Text variant="body-2" ellipsis className={styles.triggerMain}>
          {value}
        </Text>
        {selected ? (
          <span className={styles.triggerMeta} title={closedFieldMeta(selected)}>
            <Text variant="caption-2" color="complementary" ellipsis>
              {closedFieldMeta(selected)}
            </Text>
          </span>
        ) : null}
        <Icon data={ChevronDown} size={16} className={styles.triggerChevron} />
      </button>

      <Dialog
        open={open}
        onClose={() => close()}
        onEscapeKeyDown={() => close()}
        hasCloseButton
        maxWidth="l"
        fullWidth
        className={styles.dialog}
        contentOverflow="auto"
      >
        <Dialog.Header caption="Выбор модели" />
        <Dialog.Body className={styles.dialogBody}>
          <div className={styles.searchSticky}>
            <TextInput
              controlRef={searchRef}
              size="l"
              value={query}
              onUpdate={setQuery}
              placeholder={
                labScope
                  ? `Поиск в ${labTitle(labScope)}`
                  : 'Найти модель, лабораторию или задачу'
              }
              hasClear
              startContent={<Icon data={Magnifier} size={16} />}
            />
            {(labScope || homeFilter) && (
              <div className={styles.scopeRow}>
                {labScope ? (
                  <Label
                    size="s"
                    theme="unknown"
                    type="close"
                    onCloseClick={clearScope}
                  >
                    {labTitle(labScope)}
                  </Label>
                ) : null}
                {homeFilter ? (
                  <Label
                    size="s"
                    theme="unknown"
                    type="close"
                    onCloseClick={() => setHomeFilter(null)}
                  >
                    {HOME_TASK_CHIPS.find((c) => c.id === homeFilter)?.label ?? homeFilter}
                  </Label>
                ) : null}
              </div>
            )}
          </div>

          <div className={styles.scroll}>
            {showHome && !isSearchMode ? (
              <>
                {recent.length > 0 ? (
                  <section className={styles.section}>
                    <Text variant="subheader-2">Недавние</Text>
                    <div className={styles.recentRow}>
                      {recent.map((m) => (
                        <Button
                          key={m.id}
                          view="outlined"
                          size="m"
                          className={styles.recentChip}
                          onClick={() => pick(m)}
                        >
                          <ModelFamilyMark name={m.displayName} size={16} />
                          {m.displayName}
                        </Button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className={styles.section}>
                  <Text variant="subheader-2">Лаборатории</Text>
                  <div className={styles.labGrid}>
                    {labs.map((lab) => (
                      <button
                        key={lab.id}
                        type="button"
                        className={styles.labTile}
                        onClick={() => openLab(lab.id)}
                      >
                        <ModelFamilyMark
                          name={
                            lab.id === 'llama'
                              ? 'Llama'
                              : lab.id === 'gemma'
                                ? 'Gemma'
                                : lab.id === 'gpt-oss'
                                  ? 'gpt-oss'
                                  : lab.id === 'all'
                                    ? 'Model'
                                    : lab.title
                          }
                          size={28}
                        />
                        <span className={styles.labText}>
                          <Text variant="body-2">{lab.title}</Text>
                          <Text variant="caption-2" color="secondary">
                            {lab.count}{' '}
                            {lab.count === 1
                              ? 'модель'
                              : lab.count < 5
                                ? 'модели'
                                : 'моделей'}
                          </Text>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <Text variant="subheader-2">Быстрый подбор</Text>
                  </div>
                  <div className={styles.chipRow}>
                    {HOME_TASK_CHIPS.map((chip) => (
                      <Button
                        key={chip.id}
                        size="m"
                        view={homeFilter === chip.id ? 'normal' : 'outlined'}
                        selected={homeFilter === chip.id}
                        onClick={() =>
                          setHomeFilter((prev) => (prev === chip.id ? null : chip.id))
                        }
                      >
                        {chip.label}
                      </Button>
                    ))}
                  </div>
                  {homeFilter ? (
                    <ModelList
                      items={homeModels}
                      value={value}
                      onPick={pick}
                      empty={
                        <div className={styles.empty}>
                          <Text variant="body-2">Модели не найдены</Text>
                          <Button view="flat" size="m" onClick={() => setHomeFilter(null)}>
                            Сбросить фильтр
                          </Button>
                        </div>
                      }
                    />
                  ) : null}
                </section>

                {!homeFilter ? (
                  <section className={styles.section}>
                    <Text variant="subheader-2">Рекомендуемые</Text>
                    <ModelList items={recommended} value={value} onPick={pick} showBadge />
                  </section>
                ) : null}
              </>
            ) : null}

            {showHome && isSearchMode ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <Text variant="subheader-2">
                    Результаты · {homeModels.length}
                  </Text>
                </div>
                {homeModels.length === 0 ? (
                  <div className={styles.empty}>
                    <Text variant="body-1">Модели не найдены</Text>
                    <Text variant="body-2" color="secondary">
                      Измените запрос или сбросьте фильтры
                    </Text>
                    <Flex gap={2}>
                      <Button view="outlined" size="m" onClick={() => setQuery('')}>
                        Очистить запрос
                      </Button>
                      {homeFilter ? (
                        <Button view="flat" size="m" onClick={() => setHomeFilter(null)}>
                          Сбросить фильтр
                        </Button>
                      ) : null}
                    </Flex>
                  </div>
                ) : (
                  <ModelList items={homeModels} value={value} query={query} onPick={pick} />
                )}
              </section>
            ) : null}

            {!showHome && labScope ? (
              <>
                <div className={styles.labNav}>
                  <Button view="flat" size="m" onClick={clearScope}>
                    <Icon data={ChevronLeft} size={16} />
                    Все лаборатории
                  </Button>
                  <Flex alignItems="center" gap={2}>
                    <ModelFamilyMark name={labTitle(labScope)} size={22} />
                    <Text variant="subheader-2">{labTitle(labScope)}</Text>
                    <Text variant="caption-2" color="secondary">
                      {labModels.length} моделей
                    </Text>
                  </Flex>
                </div>

                <div className={styles.chipRow}>
                  {LAB_TASK_CHIPS.map((chip) => (
                    <Button
                      key={chip.id}
                      size="s"
                      view={labFilter === chip.id ? 'normal' : 'outlined'}
                      selected={labFilter === chip.id}
                      onClick={() => setLabFilter(chip.id)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>

                {labModels.length === 0 ? (
                  <div className={styles.empty}>
                    <Text variant="body-1">Модели не найдены</Text>
                    <Flex gap={2} wrap>
                      <Button view="outlined" size="m" onClick={() => setQuery('')}>
                        Очистить запрос
                      </Button>
                      <Button view="flat" size="m" onClick={clearScope}>
                        Искать среди всех лабораторий
                      </Button>
                      {labFilter !== 'all' ? (
                        <Button view="flat" size="m" onClick={() => setLabFilter('all')}>
                          Сбросить фильтры
                        </Button>
                      ) : null}
                    </Flex>
                  </div>
                ) : (
                  <ModelList
                    items={labModels}
                    value={value}
                    query={query}
                    onPick={pick}
                    showBadge
                  />
                )}

                {otherLabHits.length > 0 ? (
                  <section className={styles.section}>
                    <Text variant="subheader-2">Результаты в других лабораториях</Text>
                    <ModelList items={otherLabHits} value={value} query={query} onPick={pick} />
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </Dialog.Body>
      </Dialog>
    </div>
  );
}
